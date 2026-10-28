# Portfolio Uploader (local)

App local para criar e editar os cases do portfólio (lorenzodacunha.com.br). Ele lê e grava o conteúdo do próprio
site em Astro: `site/src/data/projects.json` (um arquivo, com inglês e espanhol nos campos `_en` e `_es`) e as
imagens em `site/public/assets/projects/`. Depois de salvar, o commit e o deploy na Vercel são feitos no repositório
do site.

O que ele faz:
- lista os 43+ projetos como um catálogo, com busca e filtros (lojas, landing pages, destaques, fora do ar, fora do padrão)
- cria e edita projetos com os campos que o site mostra: nome, endereço do case (`/cases/<id>/`), tipo, plataforma,
  período, link da loja, tecnologias, imagens e textos nos três idiomas
- **Loja fora do ar** (`offline`): o botão "Ver loja no ar" fica bloqueado com a dica "Esta loja não está mais
  disponível."; o link fica só guardado
- **Destaque** (`featured` e `order`): entra no trilho "Cases em produção"; a ordem muda arrastando no filtro Destaques
- **Parceria** (`partner` e "Minha atuação" nos três idiomas): parceiros vêm de `profile.json`
- **Desempenho** (`performance`): liga o painel do Lighthouse no case; nunca em loja fora do ar. Mostra se há medição
  guardada (`performance.json`); para medir, rode `npm run measure` no site
- **Conteúdo +18** (`adult`) e **Fundo do card** (`tone`)
- período por mês de início e de fim: o texto sai nos três idiomas ("set. a dez. de 2023", "Sep to Dec 2023",
  "sept. a dic. de 2023") e o `sort` ordena o catálogo
- imagens: arrastar capturas ou PDF; cada página de PDF vira imagem e imagens altas viram quadros 1920 × 1080 com
  sobreposição; a ordem muda arrastando e a primeira é a capa do card. Ao salvar, cada imagem nova vira
  `<id>-<n>.webp` (1280 px) e `<id>-<n>-640.webp` (cards)
- textos: editor só com o que o padrão aceita (seções, parágrafos, negrito, itálico, listas), com "Inserir seção"
  nos nomes fixos de cada idioma e modo HTML
- **padrão das descrições ao vivo**: o servidor confere os textos com `site/scripts/description-rules.mjs`, as mesmas
  regras do build do site. Um projeto fora do padrão não salva (o build do site também não passaria)
- tradução PT → EN e ES com IA local (Ollama), com console de progresso; os títulos de seção saem nos nomes fixos
- rascunho do projeto novo guardado no navegador (IndexedDB), com as imagens ainda não salvas
- exclusão com confirmação digitada; imagens que o mosaico da home (`home.json`) usa nunca são apagadas, e um projeto
  com imagem no mosaico só sai depois de trocar o mosaico

## 1) Configuração

O uploader fica ao lado do site: `clients/lorenzo/uploader` e `clients/lorenzo/site`. Se a pasta do site for
outra, ajuste `SITE_ROOT`.

### API (Express)
1. Entre em `server`.
2. Copie `.env.example` para `.env` (o padrão já aponta para `../../site`).

Variáveis principais:
- `SITE_ROOT`: pasta do site (relativa a `server/` ou absoluta)
- `PROJECTS_FILE`, `PROFILE_FILE`, `HOME_FILE`, `PERFORMANCE_FILE`: arquivos de conteúdo dentro do site
- `RULES_FILE`: as regras do padrão das descrições (`scripts/description-rules.mjs`)
- `ASSETS_DIR`: pasta das imagens dos cases
- `IMAGE_WIDTH`, `IMAGE_SMALL_WIDTH`, `WEBP_QUALITY`: tamanhos e qualidade das imagens novas
- `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`: tradução local

### Web (Vite + React)
Opcionalmente crie `web/.env` a partir de `web/.env.example`:

```env
VITE_API_URL=http://localhost:3333
VITE_SITE_URL=http://localhost:4321
```

## 2) Rodar em desenvolvimento

### Terminal 1 (API)
```bash
cd uploader/server
npm run dev
```

### Terminal 2 (Web)
```bash
cd uploader/web
npm install
npm run dev
```

App: `http://localhost:5173`. Para o link "Ver no site", rode também `npm run dev` em `site/`.

## 3) Como usar

1. Escolha um projeto na coluna da esquerda ou clique em **Novo projeto**.
2. Preencha **Projeto**: o nome gera o endereço do case (`/cases/<id>/`), que não muda depois de criado.
3. **Loja no ar**, **Vitrine**, **Parceria**, **Desempenho** e **Tecnologias** conforme o case.
4. **Imagens**: arraste capturas ou PDFs; reordene arrastando.
5. **Textos**: escreva em português, clique em **Traduzir para EN e ES** e revise as duas abas. O quadro abaixo do
   editor mostra o que está fora do padrão em cada idioma.
6. **Criar projeto** ou **Salvar alterações**. Depois, no site: `npm run build` para conferir, commit e deploy.

## 4) Endpoints da API

- `GET /api/health`
- `GET /api/meta` (parceiros, plataformas e tecnologias em uso, seções do padrão por idioma)
- `GET /api/projects` (lista do catálogo)
- `GET /api/projects/:id`
- `POST /api/projects` (multipart: `payload` + `galleryFiles`)
- `PUT /api/projects/:id` (multipart: `payload` + `galleryFiles`)
- `DELETE /api/projects/:id`
- `POST /api/check` (confere os textos no padrão, sem salvar)
- `POST /api/featured/order` (ordem do trilho de destaques, `orderedIds`)
- `POST /api/translate/stream` (NDJSON, progresso da tradução)
- `GET /api/image?src=/assets/...` (imagens do site para as prévias)

## 5) Regras de validação

- endereço do case só com letras minúsculas, números e hífen, único e imutável
- nome, plataforma, tipo, período (início antes do fim), ao menos uma tecnologia e uma imagem
- link da loja vazio ou com `http(s)://`; "fora do ar" só com link
- parceria exige "Minha atuação" nos três idiomas
- textos no padrão das descrições do site (seções fixas e na ordem, só `p`, `h2`, `ul`, `ol`, `li`, `strong` e `em`,
  sem travessão nem emoji, mesma estrutura nos três idiomas, resumo em texto puro)
- um texto que ninguém mexeu fica exatamente como estava; salvar sem mudanças não altera o `projects.json`
- caminhos sempre dentro da pasta do site
