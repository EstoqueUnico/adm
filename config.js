// ============================================
// CONFIGURAÇÃO CENTRAL DA INTRANET GV&T
// Edite apenas este arquivo para personalizar
// ============================================

const CONFIG = {
  // Nome do setor / empresa
  sectorName: "Gestão de Vendas e Transformação",
  shortName: "GV&T",

  // URL da planilha Google Sheets (formato gviz/tq)
  SHEET_URL: "https://docs.google.com/spreadsheets/d/1kWVqs-z9IdlSg3wsvkQY0m3ZXmZg2Dhz/gviz/tq?tqx=out:json",

  // Abas da planilha
  sheets: {
    index:       "Index",
    carrossel:   "Carrossel",
    comunicados: "Comunicados",
    downloads:   "Downloads",
    treinamentos:"Treinamentos",
    equipe:      "Equipe",
    links:       "Links",
  },

  // Cache em milissegundos (5 minutos)
  cacheMs: 5 * 60 * 1000,

  // Itens por página nas tabelas
  itemsPerPage: 15,

  // Intervalo do carrossel (ms)
  carouselInterval: 6000,
};
