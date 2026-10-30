// Build version, shown at the end of the header subtitle.
// `git archive` (tools/publish.sh) fills in the describe string via .gitattributes export-subst:
//   on a release tag  '0.0.4'             -> '0.0.4'
//   past a tag        '0.0.4-3-g91810ed'  -> '0.0.5-dev.03' (the next patch release, 3 commits into development)
// Served straight from a working tree (no substitution) it reads 'dev'.
const D = '$Format:%(describe:tags)$';
const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-(\d+)-g[0-9a-f]+)?$/.exec(D);
export const VERSION = !m ? 'dev' : m[4] ? `${m[1]}.${m[2]}.${+m[3] + 1}-dev.${m[4].padStart(2, '0')}` : `${m[1]}.${m[2]}.${m[3]}`;
