-- RmfAssessment.feedback 추가: AI 종합 피드백 영속 { data, model, at }
ALTER TABLE "RmfAssessment" ADD COLUMN IF NOT EXISTS "feedback" JSONB;
