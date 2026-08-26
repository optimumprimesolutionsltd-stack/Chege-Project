import { useEffect, useState } from "react";

type ProfileAvatarUser = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
};

export function ProfileAvatar({
  user,
  className = "h-10 w-10",
  textClassName = "text-sm",
  alt = "",
}: {
  user: ProfileAvatarUser | null | undefined;
  className?: string;
  textClassName?: string;
  alt?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = user?.profileImageUrl ?? null;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const initials = ([user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "U")
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-bold text-primary ${className}`}>
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className={textClassName}>{initials}</span>
      )}
    </div>
  );
}