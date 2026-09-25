---
'meocord': patch
---

`createMockChannel` takes `ThreadChannel`, stubs `threads.create` on text, announcement, forum and media channels, and gives a subclass the managers of the channel class it extends.
