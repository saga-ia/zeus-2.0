-- Transcrição de mensagens de áudio/ptt.
-- Fica separada do body para preservar a distinção "conteúdo original" vs "transcrição".
-- transcription_status: pending | ok | failed | skipped

ALTER TABLE messages ADD COLUMN transcription TEXT;
ALTER TABLE messages ADD COLUMN transcription_status TEXT;
