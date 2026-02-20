import { useId, useRef, useState } from 'react';

function FileUploadDropzone({
  id,
  onFilesSelected,
  accept = 'image/*',
  multiple = false,
  title = 'Arraste e solte',
  browseLabel = 'Escolher arquivo',
  helperText = '',
}) {
  const inputRef = useRef(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;

  const emitFiles = (fileList) => {
    if (!fileList?.length) return;
    onFilesSelected?.(fileList);
  };

  const handleInputChange = (event) => {
    emitFiles(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragActive(false);
    emitFiles(event.dataTransfer?.files);
  };

  return (
    <div className="file-upload-form">
      <label
        htmlFor={inputId}
        className={`file-upload-label ${isDragActive ? 'drag-active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="file-upload-design">
          <svg viewBox="0 0 640 512" aria-hidden="true">
            <path d="M144 480C64.5 480 0 415.5 0 336c0-62.8 40.2-116.2 96.2-135.9c-.1-2.7-.2-5.4-.2-8.1c0-88.4 71.6-160 160-160c59.3 0 111 32.2 138.7 80.2C409.9 102 428.3 96 448 96c53 0 96 43 96 96c0 12.2-2.3 23.8-6.4 34.6C596 238.4 640 290.1 640 352c0 70.7-57.3 128-128 128H144zm79-217c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l39-39V392c0 13.3 10.7 24 24 24s24-10.7 24-24V257.9l39 39c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-80-80c-9.4-9.4-24.6-9.4-33.9 0l-80 80z" />
          </svg>
          <p>{title}</p>
          <p>ou</p>
          <span className="browse-button">{browseLabel}</span>
          {helperText ? <small className="file-upload-helper">{helperText}</small> : null}
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
        />
      </label>
    </div>
  );
}

export default FileUploadDropzone;
