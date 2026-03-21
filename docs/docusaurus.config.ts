import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "TRIP",
  tagline: "Minimalist POI Map Tracker and Trip Planner",
  favicon: "img/favicon.png",
  future: {
    v4: true,
  },
  url: "https://itskovacs.github.io",
  baseUrl: "/trip/",
  organizationName: "itskovacs",
  projectName: "trip",
  onBrokenLinks: "throw",
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    image: "img/favicon.png",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "TRIP",
      logo: {
        alt: "TRIP Logo",
        src: "img/favicon.png",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          href: "https://github.com/itskovacs/trip",
          className: "header-github-link",
          position: "right",
          ariaLabel: "GitHub repository",
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
