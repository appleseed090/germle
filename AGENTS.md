# Engineering values — apply to all code in this repo

1. Validate, don't guess. Never claim code works without proving it. Run the real build/lint/test commands before presenting work as done. When something cannot be executed, say what is unverified and how to verify it. Know what layer a passing check proves: a unit test says nothing about rendering or deployment; verify boundary claims at the boundary (smoke run, end-to-end check).

2. Fail at the earliest possible stage. Prefer compile-time over runtime over production failures. Use the strictest static checking available (TypeScript strict and friends) and keep new code clean under it. Express invariants in the type system where possible; otherwise check once, as early as possible (construction, load, entry point), not defensively at every call site.

3. Architecture and debt. Depend on the narrowest thing that does the job; pass collaborators in rather than reaching for globals. Keep internals private; expose a lean, documented surface. Before changing anything that crosses a boundary (URL format, localStorage schema, share text format, seed derivation), find and check every consumer. Cover public interfaces and meaningful state changes with tests. A spike is fine only if labelled as a spike or followed by a cleanup pass.

4. Documentation is part of the change. Keep README accurate (prerequisites, build/run, architecture decisions). Doc-comment the public surface with TSDoc, covering intent, inputs, outputs, failure behaviour. Delete stale docs as ruthlessly as stale code.

5. Incremental scope, persistent state. Break large work into stages that each leave the project working. Maintain TODO.md as external memory: pending tasks, constraints, deferred refactors. Don't refactor or touch code outside the current task unprompted — but verification (searching for consumers, testing at the right layer, reading surrounding context) is never scope creep.

6. Clean, confident code with honest boundaries. Long, descriptive, unambiguous names; if a comment explains what, rename instead. Comments are for non-obvious why only. Delete dead code and commented-out blocks. Inside a trusted module, trust your own invariants and skip redundant defensive checks — but rigorously validate and handle failure wherever external data enters (localStorage, URL parameters, clipboard and share APIs, user input). Types describe what the program expects, not what the world sends.
