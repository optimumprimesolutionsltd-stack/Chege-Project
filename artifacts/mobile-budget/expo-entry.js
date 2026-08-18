// Entry-point wrapper.
// Uses the standard package import so EAS's createReleaseUpdatesResources
// Gradle task can resolve it via normal node_modules lookup.
// Our metro.config.js custom resolver returns the local symlink path so
// Metro's SHA-1 hasher stays within projectRoot during `expo export`.
import 'expo-router/entry-classic';
