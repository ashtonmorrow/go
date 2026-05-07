// === Route map registry ====================================================
// Lists that opt into a styled rail/tram route map (frontmatter
// `route_map: <key>`) look up their geometry here. Geometry is data, not
// editorial content, so it lives in code rather than in the markdown
// frontmatter — this keeps the .md files readable and avoids hand-typing
// 20+ station slugs in YAML. New route maps: add a new entry below and
// reference its key from the list's frontmatter.

export type RouteMapConfig = {
  /** Pill label rendered top-left on the map. */
  label: string;
  /** Hex color for the route line + non-terminal stop dots. */
  lineColor: string;
  /** Ordered station slug groups. Each group is one drawn line — the
   *  Alicante L1 + L2 + L4 are three separate lines on the same map. */
  segments: readonly (readonly string[])[];
};

export const ROUTE_MAPS: Record<string, RouteMapConfig> = {
  kusttram: {
    label: 'KT coastal tram',
    lineColor: '#0d8c8c',
    // Single linear coastline — De Panne to Knokke-Heist is the canonical
    // 67-stop sequence, so we let KusttramRouteMap fall through to its
    // default "stitch every pin in input order" behaviour by passing no
    // segments. The atlas's pin order already follows the line.
    segments: [],
  },
  alicante: {
    label: "TRAM d'Alacant",
    lineColor: '#b65f28',
    segments: [
      [
        'luceros', 'mercat', 'marq-castillo', 'sangueta', 'la-isleta',
        'albufereta', 'lucentum', 'miriam-blasco', 'sergio-cardell',
        'tridente', 'el-campello', 'poble-espanyol', 'amerador',
        'coveta-fuma', 'cala-piteres', 'venta-lanuza', 'paradis',
        'costera-pastor', 'creueta', 'hospital-vila',
        'c-c-la-marina-finestrat', 'terra-mitica', 'benidorm',
      ],
      [
        'luceros', 'mercat', 'marq-castillo', 'la-goteta-plaza-mar-2',
        'bulevar-del-pla', 'garbinet', 'hospital', 'maestro-alonso',
        'gaston-castello', 'virgen-del-remedio', 'ciutat-jardi',
        'santa-isabel', 'universitat', 'sant-vicent-del-raspeig',
      ],
      ['porta-del-mar', 'la-marina', 'sangueta'],
    ],
  },
};
