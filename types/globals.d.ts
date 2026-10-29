// Globals the two CDN <script> tags in index.html put on window before js/ loads.
// Types only: the browser never reads this file. No import/export here - that would turn it into a
// module and these declarations would stop being global.

/** supabase-js UMD build (index.html pins 2.117.2; package.json's devDependency must match). */
declare const supabase: typeof import('@supabase/supabase-js')

/** Chart.js UMD build. Untyped on purpose - charting is out of scope for the type gate. */
declare const Chart: any
