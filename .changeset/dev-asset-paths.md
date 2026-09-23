---
'meocord': patch
---

Resolve asset imports to files under `dist` in development builds too. `meocord start --dev` gave
`import logo from './logo.png'` the path `/assets/logo.png`, at the root of the filesystem, so a bot
reading an imported font or image failed in development while production worked.
