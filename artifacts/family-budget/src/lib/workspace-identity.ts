import type { Workspace, WorkspaceNameStyle } from "@workspace/api-client-react";

export const WORKSPACE_NAME_STYLES: {
  value: WorkspaceNameStyle;
  label: string;
  description: string;
}[] = [
  { value: "plain", label: "Classic", description: "Clean and familiar" },
  { value: "italic", label: "Flowing", description: "Soft italic emphasis" },
  { value: "bold", label: "Strong", description: "Confident and playful" },
  { value: "serif", label: "Storybook", description: "Warm serif character" },
];

export function workspaceNameClass(nameStyle?: WorkspaceNameStyle): string {
  switch (nameStyle) {
    case "italic":
      return "font-display font-medium italic";
    case "bold":
      return "font-display font-black tracking-tight";
    case "serif":
      return "font-serif font-bold";
    default:
      return "font-display font-semibold";
  }
}

export function workspaceIdentityText(
  workspace: { emoji?: string | null; name: string },
  fallback: string,
): string {
  return `${workspace.emoji ? `${workspace.emoji} ` : ""}${workspace.name.trim() || fallback}`;
}

export function workspaceLabel(
  workspace: Pick<Workspace, "isPrivate" | "name" | "emoji">,
): string {
  const name = workspace.name.trim();
  const normalizedName = name.replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  const displayName = workspace.isPrivate
    ? (name || "Personal budget")
    : (normalizedName === "shared budget" || !name ? "Group" : name);

  return `${workspace.emoji ? `${workspace.emoji} ` : ""}${displayName}`;
}