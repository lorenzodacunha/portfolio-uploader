import { useState } from 'react';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import FileUploadDropzone from './FileUploadDropzone';
import IconButton from './IconButton';

// Case images: drop screenshots or PDFs (pages become images, tall images become 1920x1080 frames), drag to order.
// The first image is the cover of the card; on save every new image becomes <id>-<n>.webp at 1280 px plus the 640 copy.
function GalleryField({ gallery, onAdd, onRemove, onMove, overlap, onOverlapChange, busyText }) {
  const [draggingId, setDraggingId] = useState('');

  return (
    <div className="gallery">
      <FileUploadDropzone
        multiple
        accept="image/*,.pdf,application/pdf"
        title="Arraste capturas ou PDFs"
        browseLabel="Escolher arquivos"
        helperText="JPG, PNG, WebP ou PDF. Imagens altas viram quadros 1920 × 1080."
        onFilesSelected={onAdd}
      />

      <div className="gallery__settings">
        <label className="field field--inline">
          <span className="field__label">Sobreposição entre quadros</span>
          <span className="input-unit">
            <input
              className="input"
              type="number"
              min="0"
              max="600"
              step="10"
              value={overlap}
              onChange={(event) => onOverlapChange(Number(event.target.value))}
            />
            <span>px</span>
          </span>
        </label>
        <p className="gallery__status" role="status">
          {busyText || `${gallery.length} ${gallery.length === 1 ? 'imagem' : 'imagens'}`}
        </p>
      </div>

      {gallery.length ? (
        <ol className="gallery__grid">
          {gallery.map((image, index) => (
            <li
              key={image.id}
              className="gallery__item"
              data-dragging={draggingId === image.id ? '' : undefined}
              draggable
              onDragStart={(event) => {
                setDraggingId(image.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                onMove(draggingId, image.id);
                setDraggingId('');
              }}
              onDragEnd={() => setDraggingId('')}
            >
              <img src={image.preview} alt={`Imagem ${index + 1}`} loading="lazy" />
              <span className="gallery__index">{index === 0 ? 'Capa' : index + 1}</span>
              {image.kind === 'new' ? <span className="gallery__new">Nova</span> : null}
              <IconButton
                icon={faXmark}
                iconOnly
                variant="glass"
                className="gallery__remove"
                ariaLabel={`Tirar a imagem ${index + 1}`}
                onClick={() => onRemove(image.id)}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-note">Nenhuma imagem ainda. A primeira que entrar vira a capa do card.</p>
      )}
    </div>
  );
}

export default GalleryField;
