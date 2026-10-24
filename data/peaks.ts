export type Peak = {
  id: string;
  code: string;
  province: string;
  name: string;
  altitude: number;
  range: string;
  coordinates: [number, number];
  note: string;
};

// Coordenadas de referencia para situar los hitos en el mapa. Cinco cumbres
// son techo compartido entre dos provincias.
export const peaks: Peak[] = [
  { id: "gorbea", code: "01", province: "Álava", name: "Gorbea", altitude: 1482.5, range: "Macizo de Gorbeia", coordinates: [43.03, -2.78], note: "Cumbre compartida con Vizcaya." },
  { id: "albacete", code: "02", province: "Albacete", name: "Pico de La Atalaya (Las Cabras)", altitude: 2083.0, range: "Sierra de las Cabras", coordinates: [38.0606, -2.3914], note: "Techo de la provincia manchega." },
  { id: "alicante", code: "03", province: "Alicante", name: "Pico de Aitana", altitude: 1557.0, range: "Sierra de Aitana", coordinates: [38.66, -0.27], note: "La cima más alta de la provincia." },
  { id: "almeria", code: "04", province: "Almería", name: "Chullo", altitude: 2611.5, range: "Sierra Nevada", coordinates: [37.095, -3.000], note: "Cumbre limítrofe con Granada." },
  { id: "avila", code: "05", province: "Ávila", name: "Pico Almanzor", altitude: 2591.0, range: "Sierra de Gredos", coordinates: [40.24, -5.30], note: "El más alto del Sistema Central." },
  { id: "badajoz", code: "06", province: "Badajoz", name: "Cerro de Tentudía", altitude: 1112.0, range: "Sierra de Tentudía", coordinates: [38.05, -6.34], note: "Mirador natural del sur de Extremadura." },
  { id: "illes-balears", code: "07", province: "Islas Baleares", name: "Puig Major", altitude: 1436.0, range: "Serra de Tramuntana", coordinates: [39.81, 2.79], note: "Cima de acceso regulado por instalaciones militares." },
  { id: "barcelona", code: "08", province: "Barcelona", name: "Pic de Costa Cabirolera", altitude: 2604.4, range: "Serra del Cadí", coordinates: [42.2814, 1.6706], note: "Techo barcelonés en el Cadí-Moixeró." },
  { id: "burgos", code: "09", province: "Burgos", name: "Pico San Millán", altitude: 2131.0, range: "Sierra de la Demanda", coordinates: [42.232, -3.206], note: "La cumbre más elevada de la Sierra de la Demanda." },
  { id: "caceres", code: "10", province: "Cáceres", name: "Calvitero (El Torreón)", altitude: 2399.0, range: "Sierra de Béjar", coordinates: [40.2918, -5.7390], note: "El punto más alto de Extremadura." },
  { id: "cadiz", code: "11", province: "Cádiz", name: "Pico del Pinar (El Torreón)", altitude: 1648.0, range: "Sierra del Pinar", coordinates: [36.77, -5.43], note: "Dentro del Parque Natural Sierra de Grazalema." },
  { id: "castellon", code: "12", province: "Castellón", name: "Peñagolosa", altitude: 1815.1, range: "Macizo del Penyagolosa", coordinates: [40.24, -0.35], note: "Una de las montañas más emblemáticas valencianas." },
  { id: "ciudad-real", code: "13", province: "Ciudad Real", name: "Amor Oeste", altitude: 1375.0, range: "Montes de Toledo", coordinates: [39.574, -4.151], note: "Techo de Ciudad Real, a unos 200 metros del Pico Amor (toledano)." },
  { id: "cordoba", code: "14", province: "Córdoba", name: "La Tiñosa", altitude: 1567.5, range: "Sierras Subbéticas", coordinates: [37.36, -4.28], note: "Techo de Córdoba, cerca de Priego." },
  { id: "coruna", code: "15", province: "La Coruña", name: "Pico Pilar", altitude: 802.9, range: "Montes del Bocelo", coordinates: [42.98, -8.02], note: "El techo de la provincia de A Coruña." },
  { id: "cuenca", code: "16", province: "Cuenca", name: "Mogorrita", altitude: 1864.0, range: "Serranía de Cuenca", coordinates: [40.27, -1.91], note: "Cerca del nacimiento del río Tajo." },
  { id: "girona", code: "17", province: "Gerona", name: "Puig Pedrós", altitude: 2914.6, range: "Pirineos", coordinates: [42.48, 1.76], note: "Techo de Gerona." },
  { id: "granada", code: "18", province: "Granada", name: "Mulhacén", altitude: 3478.6, range: "Sierra Nevada", coordinates: [37.05, -3.31], note: "Techo de la península ibérica." },
  { id: "guadalajara", code: "19", province: "Guadalajara", name: "Pico del Lobo", altitude: 2274.0, range: "Sierra de Ayllón", coordinates: [41.17, -3.51], note: "Techo de Guadalajara." },
  { id: "gipuzkoa", code: "20", province: "Guipúzcoa", name: "Aquetegui", altitude: 1551.0, range: "Aizkorri", coordinates: [42.98, -2.31], note: "El punto más alto de Euskadi." },
  { id: "huelva", code: "21", province: "Huelva", name: "Cumbre de los Bonales Occidental", altitude: 1055.0, range: "Sierra de Aracena", coordinates: [38.00, -6.64], note: "Cumbre junto a la frontera portuguesa." },
  { id: "huesca", code: "22", province: "Huesca", name: "Pico Aneto", altitude: 3404.0, range: "Macizo de la Maladeta", coordinates: [42.63, 0.66], note: "El techo de los Pirineos." },
  { id: "jaen", code: "23", province: "Jaén", name: "Pico Mágina", altitude: 2165.1, range: "Sierra Mágina", coordinates: [37.74, -3.46], note: "Cima principal del parque natural homónimo." },
  { id: "cerredo", code: "24", province: "León", name: "Torre Cerredo", altitude: 2651.9, range: "Picos de Europa", coordinates: [43.20, -4.85], note: "Cumbre compartida con Asturias." },
  { id: "lleida", code: "25", province: "Lérida", name: "Pica d'Estats", altitude: 3143.1, range: "Pirineos", coordinates: [42.67, 1.40], note: "Techo de Lérida." },
  { id: "rioja", code: "26", province: "La Rioja", name: "Cerro de San Lorenzo", altitude: 2271.4, range: "Sierra de la Demanda", coordinates: [42.24, -2.98], note: "Techo de La Rioja." },
  { id: "lugo", code: "27", province: "Lugo", name: "O Mustallar", altitude: 1930.1, range: "Ancares", coordinates: [42.80, -6.87], note: "En la sierra de Ancares." },
  { id: "penalara", code: "28", province: "Madrid", name: "Peñalara", altitude: 2428.4, range: "Sierra de Guadarrama", coordinates: [40.85, -3.95], note: "Cumbre compartida con Segovia." },
  { id: "malaga", code: "29", province: "Málaga", name: "La Maroma", altitude: 2065.0, range: "Sierra Tejeda", coordinates: [36.91, -4.08], note: "Techo de la provincia y de la Axarquía." },
  { id: "murcia", code: "30", province: "Murcia", name: "Pico Obispo", altitude: 2014.1, range: "Sierra de Revolcadores", coordinates: [38.0636, -2.2652], note: "El techo de la Región de Murcia." },
  { id: "navarra", code: "31", province: "Navarra", name: "Mesa de los Tres Reyes", altitude: 2443.7, range: "Pirineos", coordinates: [42.95, -0.73], note: "Techo de Navarra." },
  { id: "trevinca", code: "32", province: "Orense", name: "Peña Trevinca", altitude: 2128.7, range: "Macizo de Pena Trevinca", coordinates: [42.243, -6.796], note: "Cumbre compartida con Zamora." },
  { id: "cerredo", code: "33", province: "Asturias", name: "Torre Cerredo", altitude: 2651.9, range: "Picos de Europa", coordinates: [43.20, -4.85], note: "Cumbre compartida con León." },
  { id: "palencia", code: "34", province: "Palencia", name: "Peña del Infierno (Peña Prieta Sur)", altitude: 2537.0, range: "Fuentes Carrionas", coordinates: [43.0224, -4.7308], note: "Cima de la Cordillera Cantábrica." },
  { id: "las-palmas", code: "35", province: "Las Palmas", name: "Morro de la Agujereada", altitude: 1957.3, range: "Gran Canaria", coordinates: [27.94, -15.58], note: "Punto más alto de Gran Canaria." },
  { id: "pontevedra", code: "36", province: "Pontevedra", name: "Pico Faro", altitude: 1180.7, range: "Serra do Faro", coordinates: [42.60, -8.03], note: "El punto más alto de Pontevedra." },
  { id: "salamanca", code: "37", province: "Salamanca", name: "Canchal de la Ceja", altitude: 2427.4, range: "Sierra de Béjar", coordinates: [40.3045, -5.7295], note: "Cumbre del macizo de Gredos." },
  { id: "santa-cruz-tenerife", code: "38", province: "Santa Cruz de Tenerife", name: "Teide", altitude: 3718.0, range: "Tenerife", coordinates: [28.27, -16.64], note: "El punto más alto de España." },
  { id: "cantabria", code: "39", province: "Cantabria", name: "Torre Blanca", altitude: 2618.5, range: "Picos de Europa", coordinates: [43.1727, -4.8516], note: "Cumbre más alta de Cantabria." },
  { id: "penalara", code: "40", province: "Segovia", name: "Peñalara", altitude: 2428.4, range: "Sierra de Guadarrama", coordinates: [40.85, -3.95], note: "Cumbre compartida con Madrid." },
  { id: "sevilla", code: "41", province: "Sevilla", name: "Pico del Terril", altitude: 1129.0, range: "Sierra del Tablón", coordinates: [36.999, -5.173], note: "El punto culminante de la provincia." },
  { id: "moncayo", code: "42", province: "Soria", name: "Moncayo", altitude: 2314.3, range: "Sistema Ibérico", coordinates: [41.79, -1.84], note: "Cumbre compartida con Zaragoza." },
  { id: "tarragona", code: "43", province: "Tarragona", name: "Monte Caro", altitude: 1440.6, range: "Els Ports", coordinates: [40.80, 0.34], note: "Techo de Tarragona." },
  { id: "teruel", code: "44", province: "Teruel", name: "Pico de Peñarroya", altitude: 2028.0, range: "Sierra de Gúdar", coordinates: [40.39, -0.66], note: "Techo de Teruel." },
  { id: "toledo", code: "45", province: "Toledo", name: "Corocho de Rocigalgo", altitude: 1449.0, range: "Montes de Toledo", coordinates: [39.4833, -4.7167], note: "Techo de los Montes de Toledo." },
  { id: "valencia", code: "46", province: "Valencia", name: "Alto de las Barracas (Cerro Calderón)", altitude: 1837.7, range: "Rincón de Ademuz", coordinates: [40.078, -1.093], note: "Techo de Valencia." },
  { id: "valladolid", code: "47", province: "Valladolid", name: "Pico Cuchillejo", altitude: 932.2, range: "Montes Torozos", coordinates: [41.65, -4.86], note: "El punto más alto de Valladolid." },
  { id: "gorbea", code: "48", province: "Vizcaya", name: "Gorbea", altitude: 1482.5, range: "Macizo de Gorbeia", coordinates: [43.03, -2.78], note: "Cumbre compartida con Álava." },
  { id: "trevinca", code: "49", province: "Zamora", name: "Peña Trevinca", altitude: 2128.7, range: "Macizo de Pena Trevinca", coordinates: [42.243, -6.796], note: "Cumbre compartida con Orense." },
  { id: "moncayo", code: "50", province: "Zaragoza", name: "Moncayo", altitude: 2314.3, range: "Sistema Ibérico", coordinates: [41.79, -1.84], note: "Cumbre compartida con Soria." },
  { id: "ceuta", code: "51", province: "Ceuta", name: "Monte Anyera", altitude: 349.0, range: "Sierra de Anyera", coordinates: [35.89, -5.33], note: "El punto más alto de la ciudad autónoma." },
  { id: "melilla", code: "52", province: "Melilla", name: "Fuerte de Rostrogordo", altitude: 135.0, range: "Meseta de Rostrogordo", coordinates: [35.31, -2.92], note: "Punto culminante de Melilla." }
];

export const peakByCode = Object.fromEntries(peaks.map((peak) => [peak.code, peak]));
