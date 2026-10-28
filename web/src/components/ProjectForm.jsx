import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGauge, faHandshake, faImages, faLanguage, faLayerGroup, faLink, faStore, faTableCellsLarge } from '@fortawesome/free-solid-svg-icons';
import Toggle from './Toggle';
import GalleryField from './GalleryField';
import TextsField from './TextsField';
import { imageUrl } from '../lib/api';
import { periodPreview, TONES } from '../lib/form';

function Section({ icon, title, hint, children, id }) {
  return (
    <section className="form-section lz-card" aria-labelledby={id}>
      <header className="form-section__head">
        <span className="form-section__icon" aria-hidden="true">
          <FontAwesomeIcon icon={icon} />
        </span>
        <div>
          <h3 className="form-section__title type-subheading" id={id}>
            {title}
          </h3>
          {hint ? <p className="form-section__hint">{hint}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function formatDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

// The project form, one card per part of the case: identification, live store, showcase, partnership,
// performance, stack, images and texts. Field names follow what the site shows, not the JSON keys.
function ProjectForm({ form, mode, meta, measurement, issues, checking, onField, onText, gallery, texts }) {
  const [newStack, setNewStack] = useState('');
  const period = periodPreview(form.start, form.end);
  const stacks = [...new Set([...meta.stacks, ...form.stack])];

  const toggleStack = (name) =>
    onField('stack', form.stack.includes(name) ? form.stack.filter((item) => item !== name) : [...form.stack, name]);

  const addStack = () => {
    const name = newStack.trim();
    if (name && !form.stack.includes(name)) onField('stack', [...form.stack, name]);
    setNewStack('');
  };

  return (
    <div className="form">
      <Section icon={faStore} id="sec-project" title="Projeto" hint="Como o case aparece no catálogo e no endereço do site.">
        <div className="grid grid--2">
          <label className="field">
            <span className="field__label">Nome do projeto</span>
            <input className="input" value={form.title} onChange={(event) => onField('title', event.target.value)} placeholder="Ex.: Aurora Tecidos" />
          </label>
          <label className="field">
            <span className="field__label">
              Endereço do case <small>{mode === 'edit' ? 'não muda depois de criado' : 'gerado pelo nome'}</small>
            </span>
            <span className="input-prefix">
              <span>/cases/</span>
              <input
                className="input"
                value={form.id}
                readOnly={mode === 'edit'}
                onChange={(event) => onField('id', event.target.value)}
                spellCheck={false}
              />
            </span>
          </label>
          <div className="field">
            <span className="field__label">Tipo</span>
            <div className="segmented" role="radiogroup" aria-label="Tipo">
              {[
                ['loja', 'Loja'],
                ['landing', 'Landing page'],
              ].map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={form.type === value} className="segmented__option" onClick={() => onField('type', value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="field__label">Plataforma</span>
            <input className="input" list="platforms" value={form.platform} onChange={(event) => onField('platform', event.target.value)} />
            <datalist id="platforms">
              {meta.platforms.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span className="field__label">Início</span>
            <input className="input" type="month" value={form.start} onChange={(event) => onField('start', event.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Fim</span>
            <input className="input" type="month" value={form.end} onChange={(event) => onField('end', event.target.value)} />
          </label>
        </div>
        <p className="preview-line" aria-live="polite">
          {period ? (
            <>
              <span>No site:</span> {period[0]} <span className="preview-line__sep">·</span> {period[1]} <span className="preview-line__sep">·</span> {period[2]}
            </>
          ) : (
            'Informe início e fim: o período sai nos três idiomas e ordena o catálogo.'
          )}
        </p>
      </Section>

      <Section icon={faLink} id="sec-store" title="Loja no ar" hint='O botão "Ver loja no ar" do case.'>
        <label className="field">
          <span className="field__label">Link da loja</span>
          <input className="input" type="url" inputMode="url" value={form.url} onChange={(event) => onField('url', event.target.value)} placeholder="https://" spellCheck={false} />
        </label>
        <Toggle
          checked={form.offline}
          onChange={(value) => onField('offline', value)}
          disabled={!form.url.trim()}
          label="Loja fora do ar"
          hint="O botão fica bloqueado com a dica “Esta loja não está mais disponível.”; o link fica só guardado."
        />
      </Section>

      <Section icon={faTableCellsLarge} id="sec-showcase" title="Vitrine" hint="Onde e como o card aparece.">
        <div className="stack-y">
          <Toggle
            checked={form.featured}
            onChange={(value) => onField('featured', value)}
            label="Destaque em “Cases em produção”"
            hint="Entra no fim do trilho da home; a ordem muda arrastando no filtro Destaques."
          />
          <Toggle checked={form.adult} onChange={(value) => onField('adult', value)} label="Conteúdo +18" hint="Imagens desfocadas até a pessoa confirmar a idade." />
        </div>
        <div className="field">
          <span className="field__label">Fundo do card</span>
          <div className="swatches" role="radiogroup" aria-label="Fundo do card">
            {TONES.map((tone) => (
              <button key={tone.value || 'auto'} type="button" role="radio" aria-checked={form.tone === tone.value} className="swatch" data-tone={tone.value || 'auto'} onClick={() => onField('tone', tone.value)}>
                <span className="swatch__chip" aria-hidden="true" />
                {tone.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section icon={faHandshake} id="sec-partner" title="Parceria" hint="Projeto feito com uma agência ou empresa parceira.">
        <div className="partners" role="radiogroup" aria-label="Parceria">
          <button type="button" role="radio" aria-checked={!form.partner} className="partner" onClick={() => onField('partner', '')}>
            Sem parceria
          </button>
          {meta.partners.map((partner) => (
            <button key={partner.key} type="button" role="radio" aria-checked={form.partner === partner.key} className="partner" onClick={() => onField('partner', partner.key)}>
              <img src={imageUrl(partner.logo)} alt="" className="partner__logo" />
              {partner.name}
            </button>
          ))}
        </div>
        {form.partner ? <p className="note">“Minha atuação” aparece em Textos, nos três idiomas.</p> : null}
      </Section>

      <Section icon={faGauge} id="sec-performance" title="Desempenho" hint="Painel com a medição do Lighthouse no fim do case.">
        <Toggle
          checked={form.performance && !form.offline}
          onChange={(value) => onField('performance', value)}
          disabled={form.offline}
          label="Mostrar o painel de desempenho"
          hint={form.offline ? 'Desligado: loja fora do ar não mostra desempenho.' : 'Celular e computador, com a medição guardada e a ao vivo.'}
        />
        <p className="note">
          {measurement
            ? `Medição guardada em ${formatDate(measurement.fetchTime)}: celular ${measurement.mobile ?? '-'}, computador ${measurement.desktop ?? '-'}.`
            : 'Sem medição guardada. No site, rode npm run measure para medir as lojas no ar.'}
        </p>
      </Section>

      <Section icon={faLayerGroup} id="sec-stack" title="Tecnologias" hint="Selos de stack do case.">
        <div className="chips" role="group" aria-label="Tecnologias">
          {stacks.map((name) => (
            <button key={name} type="button" className="chip" aria-pressed={form.stack.includes(name)} onClick={() => toggleStack(name)}>
              {name}
            </button>
          ))}
        </div>
        <div className="inline-add">
          <input
            className="input"
            value={newStack}
            placeholder="Outra tecnologia"
            aria-label="Outra tecnologia"
            onChange={(event) => setNewStack(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addStack();
              }
            }}
          />
          <button type="button" className="icon-btn icon-btn-outline" onClick={addStack} disabled={!newStack.trim()}>
            Adicionar
          </button>
        </div>
      </Section>

      <Section icon={faImages} id="sec-images" title="Imagens" hint="Galeria do case; a primeira é a capa do card.">
        <GalleryField {...gallery} gallery={form.gallery} />
      </Section>

      <Section icon={faLanguage} id="sec-texts" title="Textos" hint="Português primeiro; a tradução preenche inglês e espanhol para você revisar.">
        <TextsField
          {...texts}
          texts={form.texts}
          onChange={onText}
          sections={meta.sections}
          hasPartner={Boolean(form.partner)}
          issues={issues}
          checking={checking}
        />
      </Section>
    </div>
  );
}

export default ProjectForm;
