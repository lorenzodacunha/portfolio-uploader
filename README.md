# Portfolio Project Uploader (Local)

Mini app local para criar/editar projetos do portfolio com:
- leitura e escrita dos JSON reais (`pt`, `en`, `es`)
- upload multiplo de imagens com ordenacao
- conversao/otimizacao de novos uploads para WebP (thumb + galeria)
- validacao de campos obrigatorios e unicidade de slug
- descricao com editor rich text (toolbar + modo HTML)
- copia de imagens para os diretorios reais usados pelo portfolio em producao

## 1) Configuracao

### API (Express)
1. Entre em `server`.
2. Copie `.env.example` para `.env`.
3. Ajuste `PORTFOLIO_ROOT` para a raiz do projeto de producao, se necessario.

Variaveis principais:
- `PORTFOLIO_ROOT`: raiz do portfolio de producao
- `PROJECTS_PT_PATH`, `PROJECTS_EN_PATH`, `PROJECTS_ES_PATH`: arquivos JSON reais
- `PROJECTS_ASSETS_DIR`: base de imagens de projetos
- `PROJECTS_THUMBS_DIR`: pasta de thumbs
- `THUMB_MAX_WIDTH`: largura maxima para thumbs (sem upscale)
- `GALLERY_MAX_WIDTH`: largura maxima para imagens de galeria (sem upscale)
- `WEBP_QUALITY`: qualidade WebP aplicada nos novos uploads
- `ENABLE_INLINE_STYLE`: permite atributo `style` no HTML sanitizado da descricao

### Web (Vite + React)
Opcionalmente crie `web/.env`:

```env
VITE_API_URL=http://localhost:3333
```

## 2) Rodar em desenvolvimento

### Terminal 1 (API)
```bash
cd "Portfolio Project Uploader/server"
npm run dev
```

### Terminal 2 (Web)
```bash
cd "Portfolio Project Uploader/web"
npm run dev
```

App web: `http://localhost:5173`

## 3) Como usar

1. Abra a tela e use a coluna esquerda para buscar/filtrar projetos existentes.
2. Clique em um card para editar ou em **Novo Projeto** para criar.
3. Preencha todos os campos:
   - categoria
   - `assetFolder`
   - datas e links
   - stacks/tecnologias (`class` + `tooltip`)
   - titulo/descricao para `pt`, `en`, `es`
4. Faça upload da thumbnail e imagens da galeria (novos arquivos sao convertidos para `.webp` no backend).
5. Reordene as imagens da galeria com as setas.
6. Edite descricao no rich text (atalhos comuns: `Ctrl/Cmd+B`, `Ctrl/Cmd+I`, `Ctrl/Cmd+U`, `Ctrl/Cmd+K`, undo/redo).
7. Clique em **Criar projeto** ou **Salvar edicao**.

## 4) Endpoints da API

- `GET /api/meta`
- `GET /api/projects?lang=pt`
- `GET /api/projects/:slug?lang=pt`
- `POST /api/projects` (multipart + `payload`)
- `PUT /api/projects/:slug?lang=pt` (multipart + `payload`)
- `GET /api/image?path=assets/...` (preview)

## 5) Regras de validacao implementadas

- campos obrigatorios do schema real do portfolio
- ao menos 1 stack e ao menos 1 imagem de galeria
- compatibilidade em `1|2|3`
- progresso em `0..100`
- slug unico por locale (derivado de `title`)
- categoria precisa existir nos JSONs reais
- paths de arquivos sempre resolvidos dentro da raiz configurada do portfolio
- sanitizacao de `description` no backend (remocao de conteudo perigoso, com whitelist)
