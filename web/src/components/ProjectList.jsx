import { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGripVertical, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { imageUrl } from '../lib/api';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'loja', label: 'Lojas' },
  { key: 'landing', label: 'Landing pages' },
  { key: 'featured', label: 'Destaques' },
  { key: 'offline', label: 'Fora do ar' },
  { key: 'issues', label: 'Fora do padrão' },
];

function matchesFilter(project, filter) {
  if (filter === 'loja' || filter === 'landing') return project.type === filter;
  if (filter === 'featured') return project.featured;
  if (filter === 'offline') return project.offline;
  if (filter === 'issues') return project.issues > 0;
  return true;
}

// Left column: the portfolio's projects as a catalog, newest first, with the draft of a new project on top.
// In "Destaques" the cards follow the rail order of the home and can be dragged to change it.
function ProjectList({ projects, draft, selectedId, isDraftActive, isLoading, onSelect, onSelectDraft, onReorderFeatured }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [draggingId, setDraggingId] = useState('');

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(({ key }) => [key, projects.filter((p) => matchesFilter(p, key)).length])),
    [projects]
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = projects.filter(
      (p) =>
        matchesFilter(p, filter) &&
        (!query || p.title.toLowerCase().includes(query) || p.id.includes(query) || p.platform.toLowerCase().includes(query))
    );
    return filter === 'featured'
      ? list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      : list.sort((a, b) => b.sort - a.sort || a.title.localeCompare(b.title));
  }, [projects, search, filter]);

  const canReorder = filter === 'featured' && !search.trim();

  const drop = (targetId) => {
    if (!draggingId || draggingId === targetId) return;
    const ids = visible.map((p) => p.id);
    ids.splice(ids.indexOf(targetId), 0, ...ids.splice(ids.indexOf(draggingId), 1));
    onReorderFeatured(ids);
  };

  return (
    <aside className="catalog lz-card" aria-label="Projetos">
      <div className="catalog__head">
        <h2 className="catalog__title type-subheading">Projetos</h2>
        <span className="catalog__count">{projects.length}</span>
      </div>

      <label className="search">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="search__icon" />
        <input
          className="input search__input"
          type="search"
          placeholder="Buscar por nome, endereço ou plataforma"
          aria-label="Buscar projeto"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      <div className="chips" role="group" aria-label="Filtrar projetos">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="chip"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            disabled={key !== 'all' && counts[key] === 0}
          >
            {label} <span className="chip__count">{counts[key]}</span>
          </button>
        ))}
      </div>

      <p className="catalog__hint">
        {filter === 'featured'
          ? canReorder
            ? 'Arraste para mudar a ordem do trilho "Cases em produção".'
            : 'Limpe a busca para reordenar os destaques.'
          : 'Mais recentes primeiro, pela data de fim.'}
      </p>

      <ul className="catalog__list">
        {draft ? (
          <li>
            <button type="button" className="project-item project-item--draft" aria-current={isDraftActive ? 'true' : undefined} onClick={onSelectDraft}>
              <span className="project-item__media">{draft.cover ? <img src={draft.cover} alt="" /> : null}</span>
              <span className="project-item__body">
                <strong>{draft.title || 'Novo projeto'}</strong>
                <small>Rascunho salvo neste navegador</small>
              </span>
            </button>
          </li>
        ) : null}
        {isLoading ? <li className="catalog__empty">Carregando projetos…</li> : null}
        {!isLoading && !visible.length ? <li className="catalog__empty">Nenhum projeto neste filtro.</li> : null}
        {visible.map((project) => (
          <li key={project.id} className={draggingId === project.id ? 'is-dragging' : undefined}>
            <button
              type="button"
              className="project-item"
              draggable={canReorder}
              onDragStart={(event) => {
                setDraggingId(project.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                if (canReorder) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                drop(project.id);
                setDraggingId('');
              }}
              onDragEnd={() => setDraggingId('')}
              aria-current={selectedId === project.id ? 'true' : undefined}
              onClick={() => onSelect(project.id)}
            >
              <span className="project-item__media">
                {project.cover ? <img src={imageUrl(project.cover)} alt="" loading="lazy" /> : null}
                {canReorder ? <span className="project-item__rank">{(project.order ?? 0) + 1}</span> : null}
              </span>
              <span className="project-item__body">
                <strong>{project.title}</strong>
                <small>
                  {project.platform} · {project.period}
                </small>
                <span className="badges">
                  {project.featured ? <span className="badge badge--brand">Destaque</span> : null}
                  {project.offline ? <span className="badge badge--muted">Fora do ar</span> : null}
                  {project.partner ? <span className="badge">Parceria</span> : null}
                  {project.performance ? <span className="badge">Desempenho</span> : null}
                  {project.adult ? <span className="badge badge--dark">+18</span> : null}
                  {project.issues ? <span className="badge badge--alert">{project.issues} fora do padrão</span> : null}
                </span>
              </span>
              {canReorder ? <FontAwesomeIcon icon={faGripVertical} className="project-item__grip" aria-hidden="true" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default ProjectList;
