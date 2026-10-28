// Fictitious projects of the public demonstration: invented stores with texts in the three languages that follow the
// content standard, a fictitious partner and screenshots drawn as SVG in each brand's colors. Nothing here is a real
// client; the store links use the reserved .example domain.
import { SECTIONS } from './description-rules.js';
import { formatPeriod, LOCALES, SUFFIX } from '../../../shared/project.js';

const SECTION = (locale, index) => SECTIONS[`description${SUFFIX[locale]}`][index].replace('?', '');

/** Context, challenge, three labelled items and the result -> the write-up with the fixed section names. */
function writeUp(locale, { context, challenge, items, result }) {
  const list = items.map(([label, text]) => `<li><strong>${label}</strong> ${text}</li>`).join('');
  return [
    `<h2>${SECTION(locale, 1)}</h2><p>${context}</p>`,
    `<h2>${SECTION(locale, 2)}</h2><p>${challenge}</p>`,
    `<h2>${SECTION(locale, 4)}</h2><ul>${list}</ul>`,
    `<h2>${SECTION(locale, 5)}</h2><p>${result}</p>`,
  ].join('');
}

const PROJECTS = [
  {
    id: 'cafe-serra-alta',
    title: 'Café Serra Alta',
    platform: 'Shopify',
    type: 'loja',
    tone: 'brand',
    period: ['2026-03', '2026-05'],
    featured: 0,
    performance: true,
    stack: ['Shopify', 'Liquid', 'JavaScript', 'Figma'],
    url: 'https://cafe-serra-alta.example',
    colors: { brand: '#6B3E26', accent: '#E9B872', soft: '#F6EFE6' },
    texts: {
      pt: {
        summary: 'E-commerce Shopify | Tema sob medida | Cafés especiais de pequenos produtores',
        context: 'A torrefação vendia só por mensagem e queria uma loja própria para assinaturas e presentes.',
        challenge: 'Mostrar a origem de cada café sem deixar a compra lenta no celular.',
        items: [['Ficha de origem:', 'região, altitude e notas de sabor em cada produto.'], ['Assinatura mensal:', 'planos com entrega recorrente e troca de moagem.'], ['Kits de presente:', 'montagem guiada com cartão personalizado.']],
        result: 'A loja passou a concentrar os pedidos e as assinaturas, com o celular como principal canal de venda.',
      },
      en: {
        summary: 'Shopify e-commerce | Custom theme | Specialty coffee from small farms',
        context: 'The roastery sold only through messages and wanted its own store for subscriptions and gifts.',
        challenge: 'Show where each coffee comes from without slowing down checkout on mobile.',
        items: [['Origin sheet:', 'region, altitude and tasting notes on every product.'], ['Monthly subscription:', 'recurring delivery plans with a choice of grind.'], ['Gift kits:', 'guided bundles with a personal card.']],
        result: 'The store now holds every order and subscription, with mobile as the main sales channel.',
      },
      es: {
        summary: 'E-commerce Shopify | Tema a medida | Cafés especiales de pequeños productores',
        context: 'La tostaduría vendía solo por mensajes y quería una tienda propia para suscripciones y regalos.',
        challenge: 'Mostrar el origen de cada café sin hacer lenta la compra en el celular.',
        items: [['Ficha de origen:', 'región, altitud y notas de sabor en cada producto.'], ['Suscripción mensual:', 'planes con entrega recurrente y cambio de molienda.'], ['Kits de regalo:', 'armado guiado con tarjeta personalizada.']],
        result: 'La tienda pasó a concentrar los pedidos y las suscripciones, con el celular como principal canal de venta.',
      },
    },
  },
  {
    id: 'lumen-cosmeticos',
    title: 'Lumen Cosméticos',
    platform: 'Nuvemshop',
    type: 'loja',
    tone: 'light',
    period: ['2025-10', '2026-01'],
    featured: 1,
    partner: 'estudio',
    stack: ['Nuvemshop', 'HTML', 'CSS', 'JavaScript'],
    url: 'https://lumen-cosmeticos.example',
    colors: { brand: '#B35C7A', accent: '#F4C6D3', soft: '#FFF5F8' },
    texts: {
      pt: {
        summary: 'E-commerce Nuvemshop | Layout personalizado | Cosméticos veganos',
        role: 'Desenvolvimento do layout e das páginas de produto',
        context: 'A marca chegou com a identidade pronta e precisava de uma loja à altura das embalagens.',
        challenge: 'Explicar ingredientes e modo de uso sem esconder o botão de compra.',
        items: [['Rotina por tipo de pele:', 'filtros que montam a rotina em três passos.'], ['Ingredientes em abas:', 'composição e cuidados lado a lado com a compra.'], ['Vitrine de lançamentos:', 'destaque na home trocado pela equipe da marca.']],
        result: 'A loja ganhou a mesma delicadeza das embalagens e ficou fácil de manter pela equipe.',
      },
      en: {
        summary: 'Nuvemshop e-commerce | Custom layout | Vegan cosmetics',
        role: 'Layout and product page development',
        context: 'The brand arrived with its identity ready and needed a store that matched its packaging.',
        challenge: 'Explain ingredients and how to use each product without hiding the buy button.',
        items: [['Routine by skin type:', 'filters that build the routine in three steps.'], ['Ingredients in tabs:', 'formula and care next to the buy button.'], ['New arrivals showcase:', 'a home highlight the brand team updates.']],
        result: 'The store gained the same care as the packaging and became easy for the team to maintain.',
      },
      es: {
        summary: 'E-commerce Nuvemshop | Diseño personalizado | Cosméticos veganos',
        role: 'Desarrollo del diseño y de las páginas de producto',
        context: 'La marca llegó con la identidad lista y necesitaba una tienda a la altura de sus envases.',
        challenge: 'Explicar ingredientes y modo de uso sin esconder el botón de compra.',
        items: [['Rutina por tipo de piel:', 'filtros que arman la rutina en tres pasos.'], ['Ingredientes en pestañas:', 'composición y cuidados junto al botón de compra.'], ['Vitrina de lanzamientos:', 'destacado en la home que actualiza el equipo de la marca.']],
        result: 'La tienda ganó la misma delicadeza de los envases y quedó fácil de mantener para el equipo.',
      },
    },
  },
  {
    id: 'oficina-pedal',
    title: 'Oficina Pedal',
    platform: 'WordPress',
    type: 'landing',
    tone: 'dark',
    period: ['2025-07', '2025-08'],
    featured: 2,
    stack: ['WordPress', 'HTML', 'CSS'],
    url: 'https://oficina-pedal.example',
    colors: { brand: '#1F3A4D', accent: '#F2A541', soft: '#EEF3F6' },
    texts: {
      pt: {
        summary: 'Landing page WordPress | Captação de clientes | Oficina de bicicletas',
        context: 'A oficina queria agendar revisões pela internet em vez de atender tudo por telefone.',
        challenge: 'Fazer uma página simples que convertesse visitas em agendamentos.',
        items: [['Tabela de serviços:', 'preços e prazos de cada revisão.'], ['Agendamento direto:', 'formulário com data e tipo de bicicleta.'], ['Prova social:', 'fotos de antes e depois dos consertos.']],
        result: 'Os agendamentos passaram a chegar organizados, com o tipo de serviço já escolhido.',
      },
      en: {
        summary: 'WordPress landing page | Lead capture | Bicycle repair shop',
        context: 'The shop wanted to book tune-ups online instead of handling everything by phone.',
        challenge: 'Build a simple page that turned visits into bookings.',
        items: [['Service table:', 'prices and turnaround for each tune-up.'], ['Direct booking:', 'a form with date and bike type.'], ['Social proof:', 'before and after photos of repairs.']],
        result: 'Bookings now arrive organized, with the type of service already chosen.',
      },
      es: {
        summary: 'Landing page WordPress | Captación de clientes | Taller de bicicletas',
        context: 'El taller quería agendar revisiones por internet en lugar de atender todo por teléfono.',
        challenge: 'Hacer una página simple que convirtiera visitas en reservas.',
        items: [['Tabla de servicios:', 'precios y plazos de cada revisión.'], ['Reserva directa:', 'formulario con fecha y tipo de bicicleta.'], ['Prueba social:', 'fotos de antes y después de las reparaciones.']],
        result: 'Las reservas pasaron a llegar organizadas, con el tipo de servicio ya elegido.',
      },
    },
  },
  {
    id: 'mare-swimwear',
    title: 'Maré Swimwear',
    platform: 'Shopify',
    type: 'loja',
    tone: 'strong',
    period: ['2025-01', '2025-03'],
    offline: true,
    stack: ['Shopify', 'Liquid', 'CSS'],
    url: 'https://mare-swimwear.example',
    colors: { brand: '#0E7C86', accent: '#FFB4A2', soft: '#EFFAF9' },
    texts: {
      pt: {
        summary: 'E-commerce Shopify | Tema adaptado | Moda praia',
        context: 'A coleção de verão precisava de uma loja pronta antes do início da temporada.',
        challenge: 'Adaptar um tema gratuito à marca em poucas semanas.',
        items: [['Guia de medidas:', 'tabela por modelo com dicas de caimento.'], ['Looks completos:', 'peças combinadas na mesma página.'], ['Carrinho lateral:', 'frete e brindes visíveis antes do checkout.']],
        result: 'A loja entrou no ar a tempo da temporada; depois do verão a marca encerrou as vendas online.',
      },
      en: {
        summary: 'Shopify e-commerce | Adapted theme | Swimwear',
        context: 'The summer collection needed a store ready before the season started.',
        challenge: 'Adapt a free theme to the brand in a few weeks.',
        items: [['Size guide:', 'a chart per style with fit tips.'], ['Complete looks:', 'matching pieces on the same page.'], ['Side cart:', 'shipping and gifts visible before checkout.']],
        result: 'The store launched in time for the season; after summer the brand closed its online sales.',
      },
      es: {
        summary: 'E-commerce Shopify | Tema adaptado | Moda de baño',
        context: 'La colección de verano necesitaba una tienda lista antes del inicio de la temporada.',
        challenge: 'Adaptar un tema gratuito a la marca en pocas semanas.',
        items: [['Guía de medidas:', 'tabla por modelo con consejos de calce.'], ['Looks completos:', 'piezas combinadas en la misma página.'], ['Carrito lateral:', 'envío y regalos visibles antes del checkout.']],
        result: 'La tienda salió al aire a tiempo para la temporada; después del verano la marca cerró sus ventas online.',
      },
    },
  },
  {
    id: 'casa-fiandeira',
    title: 'Casa Fiandeira',
    platform: 'Tray',
    type: 'loja',
    tone: '',
    period: ['2024-09', '2024-12'],
    stack: ['Tray', 'HTML', 'CSS', 'JavaScript'],
    url: 'https://casa-fiandeira.example',
    colors: { brand: '#3E5C3A', accent: '#D9A441', soft: '#F4F6EF' },
    texts: {
      pt: {
        summary: 'E-commerce Tray | Home personalizada | Tecidos e armarinho',
        context: 'A loja física de tecidos queria levar o catálogo inteiro para a internet.',
        challenge: 'Organizar milhares de produtos vendidos por metro.',
        items: [['Venda por metro:', 'quantidade em metros com cálculo do total.'], ['Busca por cor:', 'filtros de cor e composição do tecido.'], ['Home por categoria:', 'atalhos para as coleções mais buscadas.']],
        result: 'Os clientes passaram a encontrar o tecido certo sem precisar ligar para a loja.',
      },
      en: {
        summary: 'Tray e-commerce | Custom home page | Fabrics and haberdashery',
        context: 'The fabric shop wanted to bring its whole catalog online.',
        challenge: 'Organize thousands of products sold by the meter.',
        items: [['Sale by the meter:', 'quantity in meters with the total calculated.'], ['Search by color:', 'filters for color and fabric content.'], ['Home by category:', 'shortcuts to the most searched collections.']],
        result: 'Customers now find the right fabric without calling the shop.',
      },
      es: {
        summary: 'E-commerce Tray | Home personalizada | Telas y mercería',
        context: 'La tienda física de telas quería llevar todo su catálogo a internet.',
        challenge: 'Organizar miles de productos vendidos por metro.',
        items: [['Venta por metro:', 'cantidad en metros con el cálculo del total.'], ['Búsqueda por color:', 'filtros de color y composición de la tela.'], ['Home por categoría:', 'atajos a las colecciones más buscadas.']],
        result: 'Los clientes pasaron a encontrar la tela correcta sin llamar a la tienda.',
      },
    },
  },
  {
    id: 'nordic-pet',
    title: 'Nordic Pet',
    platform: 'Yampi',
    type: 'loja',
    tone: 'brand',
    period: ['2024-04', '2024-05'],
    stack: ['Yampi', 'HTML', 'CSS'],
    url: 'https://nordic-pet.example',
    colors: { brand: '#2F4858', accent: '#86BBD8', soft: '#F1F6F9' },
    texts: {
      pt: {
        summary: 'E-commerce Yampi | Layout personalizado | Acessórios para pets',
        context: 'A marca vendia camas e coleiras em marketplaces e queria um canal próprio.',
        challenge: 'Passar confiança para quem compra pela primeira vez fora do marketplace.',
        items: [['Tamanhos por raça:', 'sugestão de tamanho a partir do porte do pet.'], ['Avaliações com fotos:', 'depoimentos de clientes na página do produto.'], ['Checkout em uma página:', 'pagamento por Pix e cartão sem etapas extras.']],
        result: 'A loja própria virou o principal canal da marca, com recompra mais frequente.',
      },
      en: {
        summary: 'Yampi e-commerce | Custom layout | Pet accessories',
        context: 'The brand sold beds and collars on marketplaces and wanted its own channel.',
        challenge: 'Earn the trust of first-time buyers outside the marketplace.',
        items: [['Sizes by breed:', "size suggestions based on the pet's build."], ['Reviews with photos:', 'customer reviews on the product page.'], ['One page checkout:', 'Pix and card payment with no extra steps.']],
        result: "The store became the brand's main channel, with more frequent repeat purchases.",
      },
      es: {
        summary: 'E-commerce Yampi | Diseño personalizado | Accesorios para mascotas',
        context: 'La marca vendía camas y collares en marketplaces y quería un canal propio.',
        challenge: 'Transmitir confianza a quien compra por primera vez fuera del marketplace.',
        items: [['Tallas por raza:', 'sugerencia de talla según el tamaño de la mascota.'], ['Reseñas con fotos:', 'opiniones de clientes en la página del producto.'], ['Checkout en una página:', 'pago con Pix y tarjeta sin pasos extra.']],
        result: 'La tienda propia se volvió el principal canal de la marca, con recompra más frecuente.',
      },
    },
  },
];

export const PARTNERS = {
  estudio: { name: 'Estúdio Parceiro', logo: svgUrl(partnerLogo()), w: 120, h: 40 },
};

/** A stored Lighthouse run for the project with the performance panel on. */
export const MEASUREMENTS = {
  'cafe-serra-alta': {
    mobile: { score: 78, fetchTime: '2026-05-20T12:00:00.000Z' },
    desktop: { score: 96, fetchTime: '2026-05-20T12:00:00.000Z' },
  },
};

const VIEWS = ['home', 'colecao', 'produto'];

/** The projects as rows of projects.json; images point at the drawn screenshots (seed:<id>:<view>). */
export function seedProjects() {
  return PROJECTS.map((p) => {
    const project = {
      id: p.id,
      legacyId: '',
      featured: p.featured !== undefined,
      order: p.featured ?? null,
      title: p.title,
      platform: p.platform,
      ...formatPeriod(p.period[0], p.period[1]),
      type: p.type,
      tone: p.tone,
    };
    for (const locale of LOCALES) project[`summary${SUFFIX[locale]}`] = p.texts[locale].summary;
    for (const locale of LOCALES) project[`description${SUFFIX[locale]}`] = writeUp(locale, p.texts[locale]);
    Object.assign(project, {
      stack: p.stack,
      url: p.url,
      offline: Boolean(p.offline),
      partner: p.partner || '',
      role: p.partner ? p.texts.pt.role : '',
    });
    if (p.partner) Object.assign(project, { role_en: p.texts.en.role, role_es: p.texts.es.role });
    Object.assign(project, {
      example: false,
      adult: false,
      performance: Boolean(p.performance),
      images: VIEWS.map((view) => ({ ref: `seed:${p.id}:${view}`, width: 1280, height: 720 })),
    });
    return project;
  });
}

// ---------- drawn screenshots ----------

function svgUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function partnerLogo() {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"><rect x="4" y="16" width="48" height="48" rx="12" fill="#333"/><path d="M18 52 28 28l10 24" fill="none" stroke="#FF9D2E" stroke-width="5" stroke-linejoin="round"/><text x="64" y="50" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#333">Estúdio</text></svg>';
}

function chrome(colors, title) {
  return `<rect width="1280" height="720" fill="#fff"/>
<rect width="1280" height="64" fill="${colors.brand}"/>
<text x="48" y="41" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#fff">${escapeXml(title)}</text>
${[0, 1, 2, 3].map((i) => `<rect x="${720 + i * 110}" y="28" width="80" height="10" rx="5" fill="#fff" opacity=".7"/>`).join('')}
<circle cx="1220" cy="33" r="12" fill="${colors.accent}"/>`;
}

function card(x, y, w, colors, i) {
  const h = Math.round(w * 1.15);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${i % 2 ? colors.soft : colors.accent}"/>
<rect x="${x + w * 0.2}" y="${y + h * 0.18}" width="${w * 0.6}" height="${h * 0.55}" rx="${w * 0.3}" fill="${colors.brand}" opacity=".18"/>
<rect x="${x}" y="${y + h + 14}" width="${w * 0.75}" height="12" rx="6" fill="#333" opacity=".75"/>
<rect x="${x}" y="${y + h + 36}" width="${w * 0.4}" height="12" rx="6" fill="${colors.brand}"/>`;
}

function screenshot(project, view) {
  const { colors, title } = project;
  let body = '';
  if (view === 'home') {
    body = `<rect x="0" y="64" width="1280" height="340" fill="${colors.soft}"/>
<rect x="48" y="130" width="460" height="34" rx="8" fill="${colors.brand}"/>
<rect x="48" y="180" width="380" height="34" rx="8" fill="${colors.brand}" opacity=".85"/>
<rect x="48" y="240" width="420" height="12" rx="6" fill="#333" opacity=".45"/>
<rect x="48" y="262" width="340" height="12" rx="6" fill="#333" opacity=".45"/>
<rect x="48" y="304" width="180" height="48" rx="24" fill="${colors.accent}"/>
<rect x="700" y="96" width="532" height="276" rx="20" fill="${colors.accent}" opacity=".55"/>
<circle cx="966" cy="234" r="96" fill="${colors.brand}" opacity=".25"/>
${[0, 1, 2, 3].map((i) => card(48 + i * 300, 436, 260, colors, i)).join('')}`;
  } else if (view === 'colecao') {
    body = `<rect x="48" y="96" width="320" height="28" rx="8" fill="${colors.brand}"/>
<rect x="48" y="150" width="220" height="460" rx="12" fill="${colors.soft}"/>
${[0, 1, 2, 3, 4].map((i) => `<rect x="72" y="${180 + i * 52}" width="150" height="12" rx="6" fill="#333" opacity=".5"/>`).join('')}
${[0, 1, 2, 3, 4, 5].map((i) => card(300 + (i % 3) * 320, 150 + Math.floor(i / 3) * 290, 220, colors, i)).join('')}`;
  } else {
    body = `<rect x="48" y="96" width="600" height="560" rx="16" fill="${colors.soft}"/>
<circle cx="348" cy="376" r="170" fill="${colors.accent}" opacity=".7"/>
<rect x="700" y="110" width="420" height="34" rx="8" fill="#333" opacity=".85"/>
<rect x="700" y="164" width="160" height="28" rx="8" fill="${colors.brand}"/>
${[0, 1, 2, 3].map((i) => `<rect x="700" y="${230 + i * 26}" width="${480 - i * 40}" height="12" rx="6" fill="#333" opacity=".4"/>`).join('')}
${[0, 1, 2].map((i) => `<rect x="${700 + i * 90}" y="370" width="72" height="40" rx="10" fill="none" stroke="${colors.brand}" stroke-width="2"/>`).join('')}
<rect x="700" y="440" width="440" height="56" rx="28" fill="${colors.brand}"/>
<rect x="700" y="516" width="440" height="56" rx="28" fill="none" stroke="${colors.brand}" stroke-width="2"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">${chrome(colors, title)}${body}</svg>`;
}

const imageCache = new Map();

/** seed:<project>:<view> -> the drawn screenshot as a data URL. */
export function seedImage(ref) {
  if (!imageCache.has(ref)) {
    const [, id, view] = ref.split(':');
    const project = PROJECTS.find((p) => p.id === id);
    imageCache.set(ref, project ? svgUrl(screenshot(project, view)) : '');
  }
  return imageCache.get(ref);
}
