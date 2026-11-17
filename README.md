# Recent first: an Agents Hub plugin

Sessions in the list on the left by their latest activity: whoever just worked, replied or got a message is higher.
Each group ("Specialists", "Executors"…) is sorted on its own; an agent also rises by the freshness of its executors,
and they stay under it. Rows move to their new place with a smooth 150 ms slide; with "reduce motion" in the system,
without movement. It reorders at most once every 10 seconds: between reorders the rows stay in place, and whatever has
built up moves in one slide when the time is up. A new session in a group takes its place by its activity at once,
without moving the others.

It does not change the hub code: the `sidebar.session` place marks a row with the session name, and the order is set
with CSS `order` inside the group. Activity is `timeline_rev` from the hub snapshot (it grows with every step and
message of a session). Page only: it makes no network requests and writes nothing. It first orders all the groups and
then slides the rows, so the page is laid out once per reorder, not once per group.

Needs a hub with Plugin API 1.4. The code is MIT.
