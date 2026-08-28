import { useEffect } from 'react';

interface SeoProps {
  title: string;
  description: string;
  url?: string;
  image?: string;
}

export function useSeo({ 
  title, 
  description, 
  url = 'https://jamvi.app', 
  image = 'https://jamvi.app/branding/jamvi-mark.png' 
}: SeoProps) {
  useEffect(() => {
    document.title = `${title} | Jamvi`;
    
    const setMeta = (name: string, content: string, property = false) => {
      let element = document.querySelector(`meta[${property ? 'property' : 'name'}="${name}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(property ? 'property' : 'name', name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    setMeta('description', description);
    setMeta('og:title', `${title} | Jamvi`, true);
    setMeta('og:description', description, true);
    setMeta('og:url', url, true);
    setMeta('og:image', image, true);
    setMeta('og:type', 'website', true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', `${title} | Jamvi`);
    setMeta('twitter:description', description);
    setMeta('twitter:image', image);
  }, [title, description, url, image]);
}
