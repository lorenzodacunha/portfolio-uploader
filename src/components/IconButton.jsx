import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

function IconButton({
  icon,
  children,
  variant = 'secondary',
  iconOnly = false,
  className = '',
  ariaLabel,
  ...props
}) {
  const classes = ['icon-btn', `icon-btn-${variant}`, iconOnly ? 'icon-only' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      aria-label={iconOnly ? ariaLabel || String(children || '') : ariaLabel}
      {...props}
    >
      {icon ? <FontAwesomeIcon icon={icon} className="icon-btn-glyph" /> : null}
      {!iconOnly ? <span>{children}</span> : null}
    </button>
  );
}

export default IconButton;
