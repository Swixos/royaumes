/**
 * Architecture rules of the project (fitness functions).
 * The check fails as soon as an import breaks one of them.
 *
 * A module is a `src/modules/<name>/` directory. Only its public entries
 * (`index.ts`, `contracts.ts` and `ui.tsx`) may be imported from outside.
 */
const PUBLIC_ENTRIES = '^src/modules/[^/]+/(index\\.ts|contracts\\.ts|ui\\.tsx)$'

module.exports = {
  forbidden: [
    {
      name: 'module-encapsulation',
      comment:
        "Un module n'importe jamais l'intérieur d'un autre module, seulement ses entrées publiques.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/[^/]+/', pathNot: ['^src/modules/$1/', PUBLIC_ENTRIES] },
    },
    {
      name: 'outside-uses-public-entries',
      comment: "Hors des modules, on n'importe que les entrées publiques d'un module.",
      severity: 'error',
      from: { pathNot: '^src/modules/' },
      to: { path: '^src/modules/', pathNot: PUBLIC_ENTRIES },
    },
    {
      name: 'pure-domain',
      comment: "Le domaine d'un module n'importe que son propre répertoire domain/.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/domain/' },
      to: { pathNot: '^src/modules/$1/domain/' },
    },
    {
      name: 'application-ignores-infrastructure',
      comment: "La couche application d'un module n'importe jamais son infrastructure.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/application/' },
      to: { path: '^src/modules/$1/infrastructure/' },
    },
    {
      name: 'platform-ignores-modules',
      comment:
        'La plateforme technique ne connaît aucun module métier ni la racine de composition.',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/(modules|bootstrap)/' },
    },
    {
      name: 'client-without-server-code',
      comment:
        "Le code client (ui.tsx, src/ui) n'importe jamais de code serveur ; seuls les types sont autorisés.",
      severity: 'error',
      from: { path: '(^src/modules/[^/]+/ui\\.tsx$)|(^src/ui/)' },
      to: {
        path: '^src/(platform/|bootstrap/|modules/[^/]+/(api\\.ts|index\\.ts|application/|infrastructure/))',
        pathNot: '^src/platform/auth/client\\.ts$',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'no-circular',
      comment: "Deux fichiers ne doivent jamais dépendre l'un de l'autre, même indirectement.",
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
}
