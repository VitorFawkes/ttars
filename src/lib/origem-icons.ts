import {
    Tag,
    Megaphone,
    Users,
    Wallet,
    Briefcase,
    Building2,
    Heart,
    PenTool,
    MoreHorizontal,
    Globe,
    Zap,
    MessageCircle,
    Star,
    Bookmark,
    Gift,
    Sparkles,
    type LucideIcon,
} from 'lucide-react'

export const ORIGEM_ICON_MAP: Record<string, LucideIcon> = {
    Tag, Megaphone, Users, Wallet, Briefcase, Building2, Heart, PenTool,
    MoreHorizontal, Globe, Zap, MessageCircle, Star, Bookmark, Gift, Sparkles,
}

export function getOrigemIcon(name: string | null | undefined): LucideIcon {
    if (!name) return Tag
    return ORIGEM_ICON_MAP[name] || Tag
}
