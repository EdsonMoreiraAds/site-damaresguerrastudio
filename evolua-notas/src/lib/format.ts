export const dateBR = (d: string | Date) =>
  new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
export const dateTimeBR = (d: string | Date) =>
  new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
export const competenciaBR = (d: string) => {
  const [y, m] = d.split("-");
  return `${m}/${y}`;
};
export const moneyBR = (n: number | string) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
