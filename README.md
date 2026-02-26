# Portfolio Project Uploader (Local)

Mini app local para criar/editar projetos do portfolio com:
- leitura e escrita dos JSON reais (`pt`, `en`, `es`)
- upload multiplo de imagens com ordenacao por drag and drop
- split automatico de imagens altas em frames 1920x1080 (overlap configuravel)
- suporte a PDF na galeria (converte cada pagina para PNG e aplica split quando necessario)
- carregamento dinamico do motor de PDF (so quando o usuario envia `.pdf`)
- autosave de rascunho de criacao (rollback de formulario em refresh/fechamento)
- card de rascunho "em desenvolvimento" na lista de projetos para retomar edicao
- conversao/otimizacao de novos uploads para WebP (thumb + galeria)
- validacao de campos obrigatorios e unicidade de id
- suporte aos flags `adult` (+18) e `featured` (projeto em destaque)
- descricao com editor rich text (toolbar + modo HTML)
- traducao automatica PT -> EN/ES com IA local (Ollama)
- copia de imagens para os diretorios reais usados pelo portfolio em producao
- exclusao segura de projeto com confirmacao forte

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
- `THUMB_TARGET_WIDTH`: largura final da thumb otimizada (default `248`)
- `THUMB_CARD_ASPECT_RATIO`: proporcao do card para gerar thumb sem distorcer (default `195/113`)
- `GALLERY_MAX_WIDTH`: largura maxima para imagens de galeria (sem upscale)
- `WEBP_QUALITY`: qualidade WebP aplicada nos novos uploads
- `ENABLE_INLINE_STYLE`: permite atributo `style` no HTML sanitizado da descricao
- `OLLAMA_URL`: endpoint local do Ollama (ex.: `http://localhost:11434`)
- `OLLAMA_MODEL`: modelo preferencial para traducao (fallback automatico para modelo instalado)
- `OLLAMA_TIMEOUT_MS`: timeout de chamada ao Ollama

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
   - para reordenar cards, selecione uma categoria especifica (sem busca) e arraste os projetos.
   - quando houver rascunho de criacao, ele aparece como card "rascunho" na lista.
2. Clique em um card para editar ou em **Novo Projeto** para criar.
3. Preencha todos os campos:
   - categoria
   - `id` (gerado automaticamente, somente leitura)
   - datas, links e flags (`Projeto concluido`, `Conteudo +18`, `Projeto destaque?`)
   - stacks/tecnologias (`class` + `tooltip`)
   - titulo/descricao para `pt`, `en`, `es`
4. Na thumbnail, escolha o modo:
   - **Thumb por imagem**: upload normal (pipeline otimiza para tamanho final pequeno).
   - **Logo + Cor**: envie uma logo, escolha cor e padding; o backend gera a thumb final automaticamente no save.
5. Faca upload das imagens da galeria (JPG/PNG/WEBP ou PDF).
   - imagens altas (>1080px) sao divididas automaticamente em frames 1920x1080 no front.
   - PDFs sao convertidos em PNG por pagina antes do split.
   - o parser de PDF e carregado sob demanda apenas quando um PDF e enviado.
   - o split nao converte para webp; a conversao final ocorre somente ao salvar no backend.
6. Reordene as imagens da galeria por drag and drop.
7. Clique em **Traduzir com IA** para preencher EN/ES a partir do PT.
   - Use o botao **Console** para abrir o terminal de progresso da LLM.
8. Edite descricao no rich text (atalhos: `Ctrl/Cmd+B`, `Ctrl/Cmd+I`, `Ctrl/Cmd+U`, `Ctrl/Cmd+K`, undo/redo).
9. Em modo edicao, use **Deletar** para remover projeto (digite `Deletar` para confirmar).
10. Clique em **Criar projeto** ou **Salvar edicao**.

## 3.1) Rascunho e rollback de formulario

- Em modo **Criar projeto**, o app salva automaticamente um rascunho local do formulario.
- A persistencia usa **IndexedDB** (snapshot + arquivos binarios), nao apenas texto.
- Se recarregar a pagina ou fechar/abrir o navegador, o rascunho e restaurado.
- O rascunho aparece nos `project-cards` como item em desenvolvimento e pode ser reaberto a qualquer momento.
- O botao **Novo projeto** limpa o rascunho atual e inicia um rascunho novo (reset completo).
- Uploads locais nao salvos no backend (thumb/logo/galeria) tambem sao restaurados quando possivel.

## 4) Endpoints da API

- `GET /api/meta`
- `GET /api/projects?lang=pt`
- `POST /api/projects/reorder?lang=pt` (persistencia da ordem dos cards por categoria, via `orderedIds`)
- `GET /api/projects/:id?lang=pt`
- `POST /api/projects` (multipart + `payload`)
- `PUT /api/projects/:id?lang=pt` (multipart + `payload`)
- `DELETE /api/projects/:id?lang=pt` (remove JSON + assets relacionados)
- `POST /api/translate` (JSON, IA local via Ollama)
- `POST /api/translate/stream` (NDJSON, progresso em tempo real da LLM)
- `GET /api/image?path=assets/...` (preview)

## 5) Regras de validacao implementadas

- campos obrigatorios do schema real do portfolio
- ao menos 1 stack e ao menos 1 imagem de galeria
- compatibilidade em `1|2|3`
- progresso em `0..100`
- `id` unico e imutavel por projeto
- categoria precisa existir nos JSONs reais
- paths de arquivos sempre resolvidos dentro da raiz configurada do portfolio
- sanitizacao de `description` no backend (remocao de conteudo perigoso, com whitelist)

## 6) Traducao com IA local (Ollama)

1. Instale e rode o Ollama localmente.
2. Garanta que existe ao menos 1 modelo instalado (`ollama pull <modelo>`).
3. Configure `OLLAMA_URL` e `OLLAMA_MODEL` no `server/.env`.
4. Para `llama3.1:70b`, recomenda-se aumentar `OLLAMA_TIMEOUT_MS` (ex.: `300000` ou mais).
5. No uploader, preencha PT e clique em **Traduzir com IA**.
6. Abra o **Console** para acompanhar o andamento da geracao e validacao.
7. EN/ES sao preenchidos automaticamente e continuam editaveis para ajuste.
