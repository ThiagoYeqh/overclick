/** Retorno padrão das server actions do board. Vive fora dos arquivos
 * "use server" — lá só podem ser exportadas funções assíncronas. */
export type ActionResult = { ok: true } | { ok: false; error: string };
