---
'meocord': patch
---

Generated controllers, context menu builders and services pass the application's lint as written. `meocord g` output carried a blank line at the start of each controller class, a split context menu builder chain and a semicolon in the service, which failed prettier whenever `eslint --fix` had not already rewritten the file. Files you generated earlier are unaffected; `eslint --fix` corrects them.
