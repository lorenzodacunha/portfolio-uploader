import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faTerminal, faTriangleExclamation, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import IconButton from './IconButton';
import RichTextEditor from './RichTextEditor';
import { LOCALES, LOCALE_LABEL } from '../lib/form';

const SUMMARY_LIMIT = 110;

// Texts of the case in the three languages: summary (one line on the card), "Minha atuação" when there is a
// partnership and the write-up. Under them, the problems the content standard finds in the language on screen.
function TextsField({ texts, onChange, sections, hasPartner, issues, checking, onTranslate, isTranslating, onOpenConsole }) {
  const [locale, setLocale] = useState('pt');
  const current = texts[locale];
  const localeIssues = issues[locale] || [];

  return (
    <div className="texts">
      <div className="texts__bar">
        <div className="tabs" role="tablist" aria-label="Idioma">
          {LOCALES.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              id={`tab-${item}`}
              aria-selected={locale === item}
              aria-controls="texts-panel"
              className="tab"
              onClick={() => setLocale(item)}
            >
              {LOCALE_LABEL[item]}
              {issues[item]?.length ? <span className="tab__dot" aria-label={`${issues[item].length} fora do padrão`} /> : null}
            </button>
          ))}
        </div>
        <div className="texts__actions">
          <IconButton icon={faTerminal} variant="ghost" onClick={onOpenConsole}>
            Console
          </IconButton>
          <IconButton icon={faWandMagicSparkles} variant="outline" onClick={onTranslate} disabled={isTranslating}>
            {isTranslating ? 'Traduzindo…' : 'Traduzir para EN e ES'}
          </IconButton>
        </div>
      </div>

      <div className="texts__panel" role="tabpanel" id="texts-panel" aria-labelledby={`tab-${locale}`}>
        <label className="field">
          <span className="field__label">
            Resumo <small>uma linha, no card e abaixo do nome</small>
          </span>
          <input
            className="input"
            value={current.summary}
            maxLength={180}
            onChange={(event) => onChange(locale, 'summary', event.target.value)}
            placeholder={locale === 'pt' ? 'Ex.: E-commerce Shopify | Layout personalizado | Moda praia' : ''}
          />
          <small className="field__meta" data-over={current.summary.length > SUMMARY_LIMIT ? '' : undefined}>
            {current.summary.length} caracteres{current.summary.length > SUMMARY_LIMIT ? ', longo para uma linha do card' : ''}
          </small>
        </label>

        {hasPartner ? (
          <label className="field">
            <span className="field__label">
              Minha atuação <small>obrigatória quando há parceria</small>
            </span>
            <input
              className="input"
              value={current.role}
              onChange={(event) => onChange(locale, 'role', event.target.value)}
              placeholder={locale === 'pt' ? 'Ex.: Desenvolvimento do tema e integrações' : ''}
            />
          </label>
        ) : null}

        <div className="field">
          <span className="field__label" id={`description-${locale}`}>
            Descrição <small>seções fixas, na ordem do padrão</small>
          </span>
          <RichTextEditor
            key={locale}
            label={`Descrição em ${LOCALE_LABEL[locale]}`}
            value={current.description}
            sections={sections[locale] || []}
            onChange={(html) => onChange(locale, 'description', html)}
          />
        </div>

        <div className="standard" data-state={localeIssues.length ? 'issues' : 'ok'} aria-live="polite">
          {localeIssues.length ? (
            <>
              <p className="standard__title">
                <FontAwesomeIcon icon={faTriangleExclamation} /> {localeIssues.length} {localeIssues.length === 1 ? 'ponto' : 'pontos'} fora do padrão em {LOCALE_LABEL[locale]}
              </p>
              <ul className="standard__list">
                {localeIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="standard__title">
              <FontAwesomeIcon icon={faCircleCheck} /> {checking ? 'Conferindo o padrão…' : `${LOCALE_LABEL[locale]} no padrão das descrições.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default TextsField;
