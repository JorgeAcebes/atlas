import React from "react";
import {
  // Nature & Outdoors
  Mountain, TreePine, Waves, Sun, PawPrint,
  // Travel, Navigation & Exploration
  Plane, Rocket, Compass, Map, Tent, Telescope,
  // Places & Architecture
  Home, Building, Landmark, Store,
  // Lifestyle & Activities
  Camera, Dumbbell, Utensils, BookOpen, Trophy,
  // UI, People & Symbols
  User, Heart, CircleDot, Star
} from "lucide-react";

export function getIconComponent(name: string, size: number = 18) {
  if (!name) return <Star size={size} />;

  const emojiRegex = /\p{Extended_Pictographic}/u;
  if (emojiRegex.test(name)) {
    return (
      <span
        style={{
          fontSize: size,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {name}
      </span>
    );
  }

  switch (name) {
    // Naturaleza y Exteriores
    case "mountain": return <Mountain size={size} />;
    case "tree": return <TreePine size={size} />;
    case "waves": return <Waves size={size} />;
    case "sun": return <Sun size={size} />;
    case "paw": return <PawPrint size={size} />;

    // Viajes, Exploración y Navegación
    case "plane": return <Plane size={size} />;
    case "rocket": return <Rocket size={size} />;
    case "compass": return <Compass size={size} />;
    case "map": return <Map size={size} />;
    case "tent": return <Tent size={size} />;
    case "telescope": return <Telescope size={size} />;

    // Lugares y Arquitectura
    case "home": return <Home size={size} />;
    case "building": return <Building size={size} />;
    case "landmark": return <Landmark size={size} />;
    case "store": return <Store size={size} />;

    // Estilo de Vida y Actividades
    case "camera": return <Camera size={size} />;
    case "dumbbell": return <Dumbbell size={size} />;
    case "utensils": return <Utensils size={size} />;
    case "book": return <BookOpen size={size} />;
    case "trophy": return <Trophy size={size} />;

    // UI, Personas y Símbolos
    case "user": return <User size={size} />;
    case "heart": return <Heart size={size} />;
    case "circle-dot": return <CircleDot size={size} />;

    default: return <Star size={size} />;
  }
}

export function IconLogo({ className, style }: { className?: string, style?: React.CSSProperties }) {
  const rawId = React.useId();
  const cleanId = rawId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const greenId = `logoGradGreen_${cleanId}`;
  const purpleId = `logoGradPurple_${cleanId}`;

  return (
    <svg className={className} style={style} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={greenId} x1="8" y1="12" x2="44" y2="52">
          <stop stopColor="#5c9b7d" />
          <stop offset="1" stopColor="#245f52" />
        </linearGradient>
        <linearGradient id={purpleId} x1="20" y1="26" x2="56" y2="60">
          <stop stopColor="#9570c7" />
          <stop offset="1" stopColor="#5b3a8c" />
        </linearGradient>
      </defs>
      <path className="logo-mountain-1" d="M8 52 L32 12 L44 32 Z" fill={`url(#${greenId})`} />
      <path className="logo-mountain-2" d="M20 60 L40.4 26 L56 52 Z" fill={`url(#${purpleId})`} />
    </svg>
  );
}

export function IconCollectiveMap({ className, style, size = 20 }: { className?: string, style?: React.CSSProperties, size?: number }) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" opacity="0.85" />
      <path d="M12 3a13 13 0 0 0 0 18" opacity="0.6" />
      <path d="M12 3a13 13 0 0 1 0 18" opacity="0.6" />
      <path d="M3.6 9h16.8" opacity="0.45" strokeDasharray="1.5 2" />
      <path d="M3.6 15h16.8" opacity="0.45" strokeDasharray="1.5 2" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="9.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
      <line x1="8.5" y1="8.5" x2="15.5" y2="9.5" strokeWidth="0.9" opacity="0.75" />
      <line x1="15.5" y1="9.5" x2="12" y2="15.5" strokeWidth="0.9" opacity="0.75" />
      <line x1="12" y1="15.5" x2="8.5" y2="8.5" strokeWidth="0.9" opacity="0.75" />
    </svg>
  );
}
