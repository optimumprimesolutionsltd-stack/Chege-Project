// Local entry-point wrapper.
// This file exists so Metro can resolve the app entry as a direct project-root
// file rather than following a pnpm symlink whose relative target path can't
// be re-computed correctly when `expo export` / `eas update` run from a
// different working directory than the app root.
import 'expo-router/entry-classic';
