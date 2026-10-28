# 🗂️ Portfolio Uploader · Lorenzo da Cunha

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Ollama](https://img.shields.io/badge/Ollama-000000?style=for-the-badge&logo=ollama&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

O painel onde eu cadastro os cases do meu [portfólio](https://github.com/lorenzodacunha/portfolio). Em vez de editar
JSON e redimensionar imagens à mão, eu preencho um formulário: o uploader grava o projeto e as capturas direto nos
arquivos do site em Astro, nos três idiomas, já no formato que o site publica.

Ele segue a mesma identidade do portfólio (laranja, amarelo e vermelho-alaranjado sobre cinza escuro, títulos em
Widescreen) e confere cada texto com **as mesmas regras do build do site**: o que o uploader salva, o site publica.

### Veja a demonstração 👇
[![Demonstração](https://img.shields.io/badge/Abrir%20demonstração-FF9D2E?style=for-the-badge&logo=google-chrome&logoColor=white)](https://portfolio-uploader-gules.vercel.app)

> 💡 A demonstração usa projetos **fictícios** e guarda tudo só no seu navegador: dá para criar, editar, enviar
> imagens e excluir à vontade. O botão "Restaurar demo" traz os exemplos de volta.

---

## ✨ Funcionalidades
- **Catálogo de projetos:** busca e filtros por lojas, landing pages, destaques, lojas fora do ar e textos fora do padrão.
- **Formulário no formato do site:** nome, endereço do case (`/cases/<id>/`), tipo, plataforma, período, link da loja e tecnologias.
- **Período nos três idiomas:** escolho o mês de início e o de fim; "set. a dez. de 2023", "Sep to Dec 2023" e "sept. a dic. de 2023" saem sozinhos, junto com a ordem do catálogo.
- **Vitrine:** destaque no trilho "Cases em produção" com a ordem definida arrastando os cards, aviso de +18 e cor de fundo do card.
- **Loja fora do ar:** o botão "Ver loja no ar" do case fica bloqueado, com uma dica, e o link fica só guardado.
- **Parceria:** projeto feito com uma agência parceira, com a "Minha atuação" nos três idiomas.
- **Painel de desempenho:** ligo ou desligo a medição do Lighthouse por case e vejo a última medição guardada.
- **Imagens sem retrabalho:** arrasto capturas ou PDFs; cada página de PDF vira imagem, capturas altas viram quadros 1920 × 1080 e tudo é salvo em WebP de 1280 px com a cópia de 640 px para os cards.
- **Padrão das descrições ao vivo:** enquanto escrevo, o uploader aponta o que está fora do padrão em cada idioma; um projeto fora do padrão não salva.
- **Editor de texto enxuto:** só o que o padrão aceita (seções, parágrafos, negrito, itálico e listas), com as seções fixas a um clique e modo HTML.
- **Tradução com IA local:** português para inglês e espanhol com um modelo rodando no próprio computador (Ollama), com o progresso num console.
- **Rascunho que não se perde:** o projeto novo fica guardado no navegador, imagens incluídas, mesmo fechando a aba.
- **Edição segura:** salvar sem mudar nada não altera o arquivo do site, e imagens usadas na home nunca são apagadas.

---

## 🛠️ Tecnologias Utilizadas
- React 19 e Vite 7 (interface)
- Node.js e Express 5 (API e servidor único)
- Tiptap (editor de texto)
- pdf.js (PDF para imagem, no navegador)
- sharp (WebP de 1280 e 640 px)
- DOMPurify e sanitize-html (HTML limpo nos dois lados)
- IndexedDB (rascunho e demonstração)
- Ollama (tradução com IA local)
- Vercel (demonstração pública)
- Git/GitHub (controle de versão)

---

## 📂 Estrutura do Projeto
```
/
├── index.html
├── package.json            # Um único projeto: interface e API
├── vite.config.js          # Build e modo demonstração (DEMO=1 ou na Vercel)
├── vercel.json             # Cabeçalhos de segurança da demonstração
├── .env.example            # Pasta do site, arquivos, imagens e Ollama
│
├── server/
│   └── index.js            # API (/api) e a interface na mesma porta
│
├── shared/
│   └── project.js          # Modelo do projeto: período, regras, formato do projects.json
│
├── public/                 # Logotipo e favicon
│
└── src/
    ├── App.jsx             # Tela principal: catálogo, formulário, avisos
    ├── components/         # Lista, seções do formulário, galeria, textos, editor
    ├── lib/
    │   ├── api.js          # Chamadas à API (ou à demonstração)
    │   ├── form.js         # Estado do formulário
    │   ├── media.js        # PDF em imagens e corte em quadros 1920 × 1080
    │   ├── draft.js        # Rascunho do projeto novo
    │   └── demo/           # Demonstração: API no navegador e projetos fictícios
    └── styles/             # Tokens e componentes do design system LZ
```

---

## 🚀 Rodando localmente
Requisito: Node 20.19 ou mais novo. O uploader fica ao lado do site do portfólio
(`.../uploader` e `.../site`); se a pasta do site for outra, ajuste `SITE_ROOT` no `.env`.

```bash
cp .env.example .env
npm install
npm run dev        # http://localhost:3333 (interface e API, com recarga automática)
```

Para usar a versão compilada, também num comando de servidor só:

```bash
npm run build
npm start          # http://localhost:3333
```

Para a tradução, rode o [Ollama](https://ollama.com) e baixe um modelo (`ollama pull llama3.1:8b`, por exemplo);
o modelo preferido fica em `OLLAMA_MODEL`. O link "Ver no site" usa o `npm run dev` do site (`SITE_URL`).

Depois de salvar, o commit e o deploy são feitos no repositório do portfólio.

---

## 🧪 Demonstração
O build feito na Vercel (ou com `DEMO=1 npm run build`) não tem servidor: as mesmas rotas da API respondem dentro
do navegador e guardam projetos e imagens no IndexedDB. As regras de formulário e o padrão das descrições são os
mesmos do uploader real. Só a tradução fica desligada, porque ela depende de um modelo rodando na máquina de quem
usa o uploader.

---

## 📜 Licença
Este repositório **não possui licença pública**.  
Todos os direitos autorais estão reservados ao autor.  
Você pode visualizar o código, mas **não é permitido copiar, modificar ou distribuir** este projeto sem autorização prévia.

---

## 📬 Contato
- **LinkedIn:** [linkedin.com](https://www.linkedin.com/in/lorenzodacunha/)
- **Workana:** [workana.com](https://www.workana.com/freelancer/16c0158b6a790fe3cc607933882390bf)
- **GitHub:** [github.com](https://github.com/lorenzodacunha)
- **Portfólio:** [lorenzodacunha.com.br](https://lorenzodacunha.com.br)
- **E-mail:** contato@lorenzodacunha.com.br
