// A switch with its label and one line of help, for the yes or no settings of a project.
function Toggle({ checked, onChange, label, hint, disabled = false }) {
  return (
    <label className="toggle" data-disabled={disabled ? '' : undefined}>
      <input
        type="checkbox"
        role="switch"
        className="toggle__input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__text">
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}

export default Toggle;
