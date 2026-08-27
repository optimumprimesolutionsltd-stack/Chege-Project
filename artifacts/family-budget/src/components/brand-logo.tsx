type BrandLogoProps = {
  compact?: boolean;
  className?: string;
  alt?: string;
};

export function BrandLogo({ compact = false, className = "", alt = "Jamvi" }: BrandLogoProps) {
  const fileName = compact ? "jamvi-mark.png" : "jamvi-wordmark.png";

  return (
    <img
      src={`${import.meta.env.BASE_URL}branding/${fileName}`}
      alt={alt}
      className={`object-contain ${className}`}
    />
  );
}