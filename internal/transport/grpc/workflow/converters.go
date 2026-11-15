package workflow

import (
	"encoding/json/v2"
	"fmt"

	workflowv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/workflow/v1"
	workflowaggregator "github.com/masterkeysrd/saturn/internal/aggregator/workflow"
	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func toStructPB(m map[string]any) (*structpb.Struct, error) {
	if m == nil {
		return nil, nil
	}
	raw, err := json.Marshal(m)
	if err != nil {
		return nil, fmt.Errorf("marshal struct map: %w", err)
	}
	var st structpb.Struct
	if err := st.UnmarshalJSON(raw); err != nil {
		return nil, fmt.Errorf("unmarshal structpb: %w", err)
	}
	return &st, nil
}

func fromStructPB(st *structpb.Struct) map[string]any {
	if st == nil {
		return nil
	}
	return st.AsMap()
}

func toProtoModelConfig(mc *workflow.ModelConfig) *workflowv1.ModelConfig {
	if mc == nil {
		return nil
	}
	return &workflowv1.ModelConfig{
		AgentId:     mc.AgentID,
		ProviderId:  mc.ProviderID,
		ModelName:   mc.ModelName,
		Temperature: mc.Temperature,
	}
}

func fromProtoModelConfig(mc *workflowv1.ModelConfig) *workflow.ModelConfig {
	if mc == nil {
		return nil
	}
	return &workflow.ModelConfig{
		AgentID:     mc.AgentId,
		ProviderID:  mc.ProviderId,
		ModelName:   mc.ModelName,
		Temperature: mc.Temperature,
	}
}

func toProtoFlowConfig(cfg workflow.FlowConfig) *workflowv1.Flow_Config {
	return &workflowv1.Flow_Config{
		DefaultModel:   toProtoModelConfig(cfg.DefaultModel),
		TimeoutSeconds: cfg.TimeoutSeconds,
		MaxRetries:     cfg.MaxRetries,
	}
}

func fromProtoFlowConfig(cfg *workflowv1.Flow_Config) workflow.FlowConfig {
	if cfg == nil {
		return workflow.FlowConfig{}
	}
	return workflow.FlowConfig{
		DefaultModel:   fromProtoModelConfig(cfg.DefaultModel),
		TimeoutSeconds: cfg.TimeoutSeconds,
		MaxRetries:     cfg.MaxRetries,
	}
}

func toProtoTrigger(t workflow.Trigger) (*workflowv1.Flow_Trigger, error) {
	inputMap, err := toStructPB(t.Config.InputMapping)
	if err != nil {
		return nil, err
	}
	return &workflowv1.Flow_Trigger{
		Id:      t.ID,
		FlowId:  t.FlowID,
		SpaceId: t.SpaceID,
		Name:    t.Name,
		Type:    string(t.Type),
		Config: &workflowv1.Flow_Trigger_Config{
			Topic:        t.Config.Topic,
			Cron:         t.Config.Cron,
			ScheduleId:   t.Config.ScheduleID,
			Filter:       t.Config.Filter,
			InputMapping: inputMap,
		},
		IsEnabled:  t.IsEnabled,
		CreateTime: timestamppb.New(t.CreateTime),
		UpdateTime: timestamppb.New(t.UpdateTime),
	}, nil
}

func fromProtoTrigger(t *workflowv1.Flow_Trigger) workflow.Trigger {
	out := workflow.Trigger{
		ID:        t.Id,
		FlowID:    t.FlowId,
		SpaceID:   t.SpaceId,
		Name:      t.Name,
		Type:      workflow.TriggerType(t.Type),
		IsEnabled: t.IsEnabled,
	}
	if t.Config != nil {
		out.Config = workflow.TriggerConfig{
			Topic:        t.Config.Topic,
			Cron:         t.Config.Cron,
			ScheduleID:   t.Config.ScheduleId,
			Filter:       t.Config.Filter,
			InputMapping: fromStructPB(t.Config.InputMapping),
		}
	}
	return out
}

func fromProtoTriggers(list []*workflowv1.Flow_Trigger) []workflow.Trigger {
	out := make([]workflow.Trigger, 0, len(list))
	for _, t := range list {
		if t == nil {
			continue
		}
		out = append(out, fromProtoTrigger(t))
	}
	return out
}

func toProtoStepNode(s workflow.StepNode) (*workflowv1.Flow_StepNode, error) {
	inputsPB, err := toStructPB(s.Inputs)
	if err != nil {
		return nil, err
	}
	var onErr *string
	if s.OnError != "" {
		onErr = new(s.OnError)
	}
	out := &workflowv1.Flow_StepNode{
		Id:      s.ID,
		Name:    s.Name,
		Type:    s.Type,
		OnError: onErr,
		Model:   toProtoModelConfig(s.Model),
		Inputs:  inputsPB,
	}
	if len(s.Sources) > 0 {
		out.Sources = make(map[string]*workflowv1.Flow_SourceBinding, len(s.Sources))
		for alias, b := range s.Sources {
			paramsPB, pErr := toStructPB(b.Params)
			if pErr != nil {
				return nil, pErr
			}
			var reqPtr *bool
			if b.Required {
				reqPtr = new(true)
			}
			out.Sources[alias] = &workflowv1.Flow_SourceBinding{
				Loader:   b.Loader,
				Params:   paramsPB,
				Required: reqPtr,
			}
		}
	}
	if len(s.Cases) > 0 {
		out.Cases = make([]*workflowv1.Flow_SwitchCase, 0, len(s.Cases))
		for i := range s.Cases {
			sc := s.Cases[i]
			subSteps, cErr := toProtoStepNodes(sc.Steps)
			if cErr != nil {
				return nil, cErr
			}
			out.Cases = append(out.Cases, &workflowv1.Flow_SwitchCase{
				Name:      sc.Name,
				Condition: sc.Condition,
				Steps:     subSteps,
			})
		}
	}
	if len(s.Default) > 0 {
		defSteps, dErr := toProtoStepNodes(s.Default)
		if dErr != nil {
			return nil, dErr
		}
		out.Default = defSteps
	}
	if len(s.Steps) > 0 {
		loopSteps, lErr := toProtoStepNodes(s.Steps)
		if lErr != nil {
			return nil, lErr
		}
		out.Steps = loopSteps
	}
	return out, nil
}

func toProtoStepNodes(steps []workflow.StepNode) ([]*workflowv1.Flow_StepNode, error) {
	out := make([]*workflowv1.Flow_StepNode, 0, len(steps))
	for i := range steps {
		pb, err := toProtoStepNode(steps[i])
		if err != nil {
			return nil, err
		}
		out = append(out, pb)
	}
	return out, nil
}

func fromProtoStepNode(s *workflowv1.Flow_StepNode) workflow.StepNode {
	if s == nil {
		return workflow.StepNode{}
	}
	out := workflow.StepNode{
		ID:     s.Id,
		Name:   s.Name,
		Type:   s.Type,
		Model:  fromProtoModelConfig(s.Model),
		Inputs: fromStructPB(s.Inputs),
	}
	if s.OnError != nil {
		out.OnError = *s.OnError
	}
	if len(s.Sources) > 0 {
		out.Sources = make(map[string]workflow.SourceBinding, len(s.Sources))
		for alias, b := range s.Sources {
			if b == nil {
				continue
			}
			req := false
			if b.Required != nil {
				req = *b.Required
			}
			out.Sources[alias] = workflow.SourceBinding{
				Loader:   b.Loader,
				Params:   fromStructPB(b.Params),
				Required: req,
			}
		}
	}
	if len(s.Cases) > 0 {
		out.Cases = make([]workflow.SwitchCase, 0, len(s.Cases))
		for _, sc := range s.Cases {
			if sc == nil {
				continue
			}
			out.Cases = append(out.Cases, workflow.SwitchCase{
				Name:      sc.Name,
				Condition: sc.Condition,
				Steps:     fromProtoStepNodes(sc.Steps),
			})
		}
	}
	if len(s.Default) > 0 {
		out.Default = fromProtoStepNodes(s.Default)
	}
	if len(s.Steps) > 0 {
		out.Steps = fromProtoStepNodes(s.Steps)
	}
	return out
}

func fromProtoStepNodes(steps []*workflowv1.Flow_StepNode) []workflow.StepNode {
	out := make([]workflow.StepNode, 0, len(steps))
	for _, s := range steps {
		if s == nil {
			continue
		}
		out = append(out, fromProtoStepNode(s))
	}
	return out
}

func toProtoFlowStats(st *workflow.FlowStats) *workflowv1.Flow_Stats {
	if st == nil {
		return nil
	}
	pb := &workflowv1.Flow_Stats{
		TotalRuns_7D:     st.TotalRuns7d,
		CompletedRuns_7D: st.CompletedRuns7d,
		FailedRuns_7D:    st.FailedRuns7d,
		FilteredRuns_7D:  st.FilteredRuns7d,
		LastRunStatus:    st.LastRunStatus,
		DailyCounts_7D:   st.DailyCounts7d,
	}
	if st.LastRunAt != nil {
		pb.LastRunAt = timestamppb.New(*st.LastRunAt)
	}
	return pb
}

func toProtoFlow(f *workflow.Flow) (*workflowv1.Flow, error) {
	if f == nil {
		return nil, nil
	}
	inputSchemaPB, err := toStructPB(f.InputSchema)
	if err != nil {
		return nil, err
	}
	stepsPB, err := toProtoStepNodes(f.Steps)
	if err != nil {
		return nil, err
	}
	triggersPB := make([]*workflowv1.Flow_Trigger, 0, len(f.Triggers))
	for i := range f.Triggers {
		tPB, tErr := toProtoTrigger(f.Triggers[i])
		if tErr != nil {
			return nil, tErr
		}
		triggersPB = append(triggersPB, tPB)
	}
	return &workflowv1.Flow{
		Id:          f.ID,
		SpaceId:     f.SpaceID,
		SystemKey:   f.SystemKey,
		IsSystem:    f.IsSystem,
		IsEnabled:   f.IsEnabled,
		Name:        f.Name,
		Description: f.Description,
		Config:      toProtoFlowConfig(f.Config),
		InputSchema: inputSchemaPB,
		Steps:       stepsPB,
		Triggers:    triggersPB,
		Version:     f.Version,
		Stats:       toProtoFlowStats(f.Stats),
		CreateTime:  timestamppb.New(f.CreateTime),
		UpdateTime:  timestamppb.New(f.UpdateTime),
	}, nil
}

func fromProtoFlow(f *workflowv1.Flow) *workflow.Flow {
	if f == nil {
		return nil
	}
	return &workflow.Flow{
		ID:          f.Id,
		SpaceID:     f.SpaceId,
		SystemKey:   f.SystemKey,
		IsSystem:    f.IsSystem,
		IsEnabled:   f.IsEnabled,
		Name:        f.Name,
		Description: f.Description,
		Config:      fromProtoFlowConfig(f.Config),
		InputSchema: fromStructPB(f.InputSchema),
		Steps:       fromProtoStepNodes(f.Steps),
		Triggers:    fromProtoTriggers(f.Triggers),
		Version:     f.Version,
	}
}

func toProtoFlowError(fe *workflow.FlowError) *workflowv1.FlowError {
	if fe == nil {
		return nil
	}
	return &workflowv1.FlowError{
		StepId:  fe.StepID,
		Code:    fe.Code,
		Message: fe.Message,
	}
}

func toProtoStepRun(sr workflow.StepRun) (*workflowv1.FlowRun_StepRun, error) {
	outPB, err := toStructPB(sr.Output)
	if err != nil {
		return nil, err
	}
	metaPB, err := toStructPB(sr.Metadata)
	if err != nil {
		return nil, err
	}
	pb := &workflowv1.FlowRun_StepRun{
		Id:           sr.ID,
		FlowRunId:    sr.FlowRunID,
		SpaceId:      sr.SpaceID,
		StepId:       sr.StepID,
		StepType:     sr.StepType,
		ExecutionKey: sr.ExecutionKey,
		Status:       string(sr.Status),
		Output:       outPB,
		Error:        toProtoFlowError(sr.Error),
		Metadata:     metaPB,
		AgentRunId:   sr.AgentRunID,
		StartTime:    timestamppb.New(sr.StartTime),
		CreateTime:   timestamppb.New(sr.CreateTime),
		UpdateTime:   timestamppb.New(sr.UpdateTime),
	}
	if sr.EndTime != nil {
		pb.EndTime = timestamppb.New(*sr.EndTime)
	}
	return pb, nil
}

func toProtoFlowRun(r *workflow.FlowRun, flowName *string) (*workflowv1.FlowRun, error) {
	if r == nil {
		return nil, nil
	}
	trigDataPB, err := toStructPB(r.TriggerData)
	if err != nil {
		return nil, err
	}
	inPB, err := toStructPB(r.Input)
	if err != nil {
		return nil, err
	}
	outPB, err := toStructPB(r.Output)
	if err != nil {
		return nil, err
	}
	metaPB, err := toStructPB(r.Metadata)
	if err != nil {
		return nil, err
	}
	stepRunsPB := make([]*workflowv1.FlowRun_StepRun, 0, len(r.StepRuns))
	for i := range r.StepRuns {
		srPB, srErr := toProtoStepRun(r.StepRuns[i])
		if srErr != nil {
			return nil, srErr
		}
		stepRunsPB = append(stepRunsPB, srPB)
	}

	pb := &workflowv1.FlowRun{
		Id:             r.ID,
		SpaceId:        r.SpaceID,
		FlowId:         r.FlowID,
		FlowName:       flowName,
		FlowVersion:    r.FlowVersion,
		TriggerId:      r.TriggerID,
		IdempotencyKey: r.IdempotencyKey,
		Status:         string(r.Status),
		Attempts:       int32(r.Attempts),
		TriggerData:    trigDataPB,
		Input:          inPB,
		Output:         outPB,
		Error:          toProtoFlowError(r.Error),
		Metadata:       metaPB,
		StepRuns:       stepRunsPB,
		CreateTime:     timestamppb.New(r.CreateTime),
		UpdateTime:     timestamppb.New(r.UpdateTime),
	}
	if r.ResumeTime != nil {
		pb.ResumeTime = timestamppb.New(*r.ResumeTime)
	}
	if r.StartTime != nil {
		pb.StartTime = timestamppb.New(*r.StartTime)
	}
	if r.EndTime != nil {
		pb.EndTime = timestamppb.New(*r.EndTime)
	}
	return pb, nil
}

func toProtoFlowRunView(v *workflowaggregator.FlowRunView) (*workflowv1.FlowRun, error) {
	if v == nil {
		return nil, nil
	}
	return toProtoFlowRun(v.FlowRun, v.FlowName)
}

func fromProtoInlineArtifacts(list []*workflowv1.InlineArtifact) []workflowapp.InlineArtifact {
	out := make([]workflowapp.InlineArtifact, 0, len(list))
	for _, a := range list {
		if a == nil {
			continue
		}
		field := ""
		if a.FieldName != nil {
			field = *a.FieldName
		}
		out = append(out, workflowapp.InlineArtifact{
			Filename:    a.Filename,
			ContentType: a.ContentType,
			Data:        a.Data,
			FieldName:   field,
		})
	}
	return out
}

func toProtoCatalog(cat workflow.Catalog) (*workflowv1.Catalog, error) {
	topics := make([]*workflowv1.Catalog_TriggerTopic, 0, len(cat.TriggerTopics))
	for _, t := range cat.TriggerTopics {
		payloadPB, err := toStructPB(t.PayloadSchema)
		if err != nil {
			return nil, err
		}
		topics = append(topics, &workflowv1.Catalog_TriggerTopic{
			Topic:         t.Topic,
			Domain:        t.Domain,
			DisplayName:   t.DisplayName,
			Description:   t.Description,
			PayloadSchema: payloadPB,
		})
	}

	steps := make([]*workflowv1.Catalog_Step, 0, len(cat.Steps))
	for _, s := range cat.Steps {
		inPB, err := toStructPB(s.InputsSchema)
		if err != nil {
			return nil, err
		}
		outPB, err := toStructPB(s.OutputSchema)
		if err != nil {
			return nil, err
		}
		steps = append(steps, &workflowv1.Catalog_Step{
			Type:         s.Type,
			Owner:        s.Owner,
			Category:     s.Category,
			DisplayName:  s.DisplayName,
			Description:  s.Description,
			InputsSchema: inPB,
			OutputSchema: outPB,
		})
	}

	loaders := make([]*workflowv1.Catalog_Loader, 0, len(cat.Loaders))
	for _, l := range cat.Loaders {
		pPB, err := toStructPB(l.ParamsSchema)
		if err != nil {
			return nil, err
		}
		oPB, err := toStructPB(l.OutputSchema)
		if err != nil {
			return nil, err
		}
		loaders = append(loaders, &workflowv1.Catalog_Loader{
			Name:         l.Name,
			Owner:        l.Owner,
			DisplayName:  l.DisplayName,
			Description:  l.Description,
			ParamsSchema: pPB,
			OutputSchema: oPB,
		})
	}

	helpers := make([]*workflowv1.Catalog_CelHelper, 0, len(cat.CelHelpers))
	for _, h := range cat.CelHelpers {
		helpers = append(helpers, &workflowv1.Catalog_CelHelper{
			Name:        h.Name,
			Signature:   h.Signature,
			Description: h.Description,
			Example:     h.Example,
		})
	}

	return &workflowv1.Catalog{
		TriggerTopics: topics,
		Steps:         steps,
		Loaders:       loaders,
		CelHelpers:    helpers,
	}, nil
}
