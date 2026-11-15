// Package workflow provides Saturn's domain-agnostic workflow automation substrate,
// including flow definitions, multi-trigger bindings, CEL expression evaluation,
// dynamic loom/graph compilation, StepRun checkpoint replay, and data loader caching.
//
// Domain modules register their own DataLoaders, Action Steps, ArtifactReaders, and
// SystemFlowBlueprints onto Registry without introducing domain imports into this package.
package workflow
