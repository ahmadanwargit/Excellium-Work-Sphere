import logoForLightBg from '../../assets/excellium-logo.png';
import logoForDarkBg from '../../assets/excellium-logo-light.png';

export function Logo({ large = false, light = true }) {
  const className = `brand-logo-img${large ? ' brand-logo-img-large' : ''}`;

  if (light) {
    // Rendered on a dark surface (sidebar, login panel): always use the white-on-dark artwork.
    return <img className={className} src={logoForDarkBg} alt="Excellium Global Services" />;
  }

  // Rendered on a theme-aware surface: swap artwork with the color scheme.
  return (
    <>
      <img className={`${className} brand-logo-scheme-light`} src={logoForLightBg} alt="Excellium Global Services" />
      <img className={`${className} brand-logo-scheme-dark`} src={logoForDarkBg} alt="" aria-hidden="true" />
    </>
  );
}
