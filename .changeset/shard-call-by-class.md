---
'meocord': patch
---

Fix `ShardContext.call` running a different service than the one passed when two controllers or services share a class name and the bot runs in one process, with internal sharding or none, or in a testing module. The call now reaches the class it is given; only a call arriving from another shard in process mode finds its service by name, where MeoCord already refuses two classes with one name.
