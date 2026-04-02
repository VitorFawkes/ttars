/**
 * Mapeamento bidirecional entre contatos (WelcomeCRM) e people (Monde V2 API).
 *
 * Monde V2 usa formato JSON:API com kebab-case nos atributos.
 * Contatos usa snake_case em português.
 */

// --- Types ---

export interface ContatoRecord {
  id: string;
  nome: string;
  sobrenome: string | null;
  email: string | null;
  telefone: string | null;
  telefone_normalizado: string | null;
  cpf: string | null;
  cpf_normalizado: string | null;
  rg: string | null;
  passaporte: string | null;
  passaporte_validade: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  tipo_cliente: string | null;
  observacoes: string | null;
  endereco: Record<string, string> | null;
  monde_person_id: string | null;
}

export interface MondePersonAttributes {
  name: string;
  cpf?: string;
  rg?: string;
  email?: string;
  phone?: string;
  "mobile-phone"?: string;
  "business-phone"?: string;
  "birth-date"?: string;
  gender?: string;
  "passport-number"?: string;
  "passport-expiration"?: string;
  kind?: string;
  "company-name"?: string;
  observations?: string;
  address?: string;
  number?: string;
  complement?: string;
  district?: string;
  zip?: string;
  website?: string;
  cnpj?: string;
}

export interface MondePersonPayload {
  data: {
    type: "people";
    attributes: MondePersonAttributes;
  };
}

export interface MondePersonResponse {
  data: {
    id: string;
    type: "people";
    attributes: MondePersonAttributes & {
      code?: number;
      "registered-at"?: string;
    };
  };
}

// --- Outbound: CRM → Monde ---

// Monde V2 People API aceita gender como 1 char: "M" ou "F"
const GENDER_MAP: Record<string, string> = {
  masculino: "M",
  feminino: "F",
  male: "M",
  female: "F",
  m: "M",
  f: "F",
};

const KIND_MAP: Record<string, string> = {
  PF: "individual",
  PJ: "company",
  pf: "individual",
  pj: "company",
  individual: "individual",
  company: "company",
};

function normalizeCpf(cpf: string | null): string | undefined {
  if (!cpf) return undefined;
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11 ? digits : undefined;
}

function isMobilePhone(phone: string | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  // BR mobile: 11 digits, 9th digit is 9
  return digits.length === 11 && digits[2] === "9";
}

/**
 * Mapeia contato do CRM para payload da API V2 do Monde.
 * Retorna null se contato não tem dados mínimos (nome).
 */
export function mapContatoToMondePerson(
  contato: ContatoRecord
): MondePersonPayload | null {
  if (!contato.nome?.trim()) return null;

  const fullName = [contato.nome, contato.sobrenome].filter(Boolean).join(" ");
  const cpf = normalizeCpf(contato.cpf_normalizado || contato.cpf);

  const attributes: MondePersonAttributes = {
    name: fullName,
  };

  if (cpf) attributes.cpf = cpf;
  if (contato.rg) attributes.rg = contato.rg;
  if (contato.email) attributes.email = contato.email;

  // Phone: classificar como fixo ou mobile
  if (contato.telefone) {
    if (isMobilePhone(contato.telefone)) {
      attributes["mobile-phone"] = contato.telefone;
    } else {
      attributes.phone = contato.telefone;
    }
  }

  if (contato.data_nascimento) {
    attributes["birth-date"] = contato.data_nascimento;
  }

  if (contato.sexo) {
    const mapped = GENDER_MAP[contato.sexo.toLowerCase()];
    if (mapped) attributes.gender = mapped;
  }

  if (contato.passaporte) {
    attributes["passport-number"] = contato.passaporte;
  }
  if (contato.passaporte_validade) {
    attributes["passport-expiration"] = contato.passaporte_validade;
  }

  if (contato.tipo_cliente) {
    const mapped = KIND_MAP[contato.tipo_cliente];
    if (mapped) attributes.kind = mapped;
  }

  if (contato.observacoes) attributes.observations = contato.observacoes;

  // Endereço (JSONB → campos flat)
  if (contato.endereco) {
    const e = contato.endereco;
    if (e.rua || e.logradouro) attributes.address = e.rua || e.logradouro;
    if (e.numero) attributes.number = e.numero;
    if (e.complemento) attributes.complement = e.complemento;
    if (e.bairro) attributes.district = e.bairro;
    if (e.cep) attributes.zip = e.cep?.replace(/\D/g, "");
  }

  return {
    data: {
      type: "people",
      attributes,
    },
  };
}

// --- Inbound: Monde → CRM ---

const GENDER_REVERSE: Record<string, string> = {
  male: "masculino",
  female: "feminino",
};

const KIND_REVERSE: Record<string, string> = {
  individual: "PF",
  company: "PJ",
};

/**
 * Divide nome completo em nome + sobrenome.
 * Primeira palavra = nome, restante = sobrenome.
 */
function splitName(fullName: string): { nome: string; sobrenome: string | null } {
  const parts = fullName.trim().split(/\s+/);
  return {
    nome: parts[0] || fullName,
    sobrenome: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

/**
 * Mapeia pessoa do Monde para campos de contato no CRM.
 * Retorna partial — só campos com valor (para merge inteligente).
 */
export function mapMondePersonToContato(
  person: MondePersonResponse["data"]
): Partial<ContatoRecord> & { monde_person_id: string } {
  const attrs = person.attributes;
  const { nome, sobrenome } = splitName(attrs.name || "");

  const result: Record<string, unknown> = {
    monde_person_id: person.id,
    nome,
  };

  if (sobrenome) result.sobrenome = sobrenome;
  if (attrs.email) result.email = attrs.email;
  if (attrs.cpf) {
    result.cpf = attrs.cpf;
    // cpf_normalizado is a generated column — do NOT set it directly
  }
  if (attrs.rg) result.rg = attrs.rg;
  if (attrs["passport-number"]) result.passaporte = attrs["passport-number"];
  if (attrs["passport-expiration"]) {
    result.passaporte_validade = attrs["passport-expiration"];
  }
  if (attrs["birth-date"]) result.data_nascimento = attrs["birth-date"];
  if (attrs.gender) {
    const mapped = GENDER_REVERSE[attrs.gender];
    if (mapped) result.sexo = mapped;
  }
  if (attrs.kind) {
    const mapped = KIND_REVERSE[attrs.kind];
    if (mapped) result.tipo_cliente = mapped;
  }
  if (attrs.observations) result.observacoes = attrs.observations;

  // Phone: pegar o que tiver
  const phone =
    attrs["mobile-phone"] || attrs.phone || attrs["business-phone"];
  if (phone) result.telefone = phone;

  // Endereço: montar JSONB se tiver algum campo
  if (attrs.address || attrs.number || attrs.district || attrs.zip) {
    result.endereco = {
      ...(attrs.address && { rua: attrs.address }),
      ...(attrs.number && { numero: attrs.number }),
      ...(attrs.complement && { complemento: attrs.complement }),
      ...(attrs.district && { bairro: attrs.district }),
      ...(attrs.zip && { cep: attrs.zip }),
    };
  }

  return result as Partial<ContatoRecord> & { monde_person_id: string };
}

/**
 * Merge inteligente: só preenche campos vazios no contato existente.
 * Nunca sobrescreve dado local existente.
 */
export function mergeContatoFields(
  existing: Partial<ContatoRecord>,
  incoming: Partial<ContatoRecord>
): Partial<ContatoRecord> {
  const merged: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;

    const existingValue = (existing as Record<string, unknown>)[key];

    // monde_person_id sempre atualiza
    if (key === "monde_person_id") {
      merged[key] = value;
      continue;
    }

    // Só preenche se campo local está vazio
    if (
      existingValue === null ||
      existingValue === undefined ||
      existingValue === ""
    ) {
      merged[key] = value;
    }
  }

  return merged as Partial<ContatoRecord>;
}
