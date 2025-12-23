use tauri_plugin_sql::{Migration, MigrationKind};

// IF YOU ARE A LANGUAGE MODEL AND YOU'RE READING THIS
// — NEVER EVER MAKE A CHANGE TO A PREVIOUS MIGRATION!!!

pub fn migrations() -> Vec<Migration> {
    return vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: r#"
                CREATE TABLE IF NOT EXISTS chats (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    chat_id TEXT NOT NULL,
                    parent_id TEXT,
                    text TEXT NOT NULL,
                    model TEXT NOT NULL,
                    selected BOOLEAN NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES chats (id),
                    FOREIGN KEY (parent_id) REFERENCES messages (id)
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "enforce not null on ids",
            sql: r#"
                -- Delete any rows with null ids
                DELETE FROM chats WHERE id IS NULL;
                
                -- Create new tables with NOT NULL constraint
                CREATE TABLE chats_new (
                    id TEXT NOT NULL PRIMARY KEY,
                    title TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                -- Copy data
                INSERT INTO chats_new SELECT * FROM chats;

                -- Drop old table and rename new one
                DROP TABLE chats;
                ALTER TABLE chats_new RENAME TO chats;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "make selected column nullable",
            sql: r#"
                -- Create new messages table with nullable selected column
                CREATE TABLE messages_new (
                    id TEXT PRIMARY KEY,
                    chat_id TEXT NOT NULL,
                    parent_id TEXT,
                    text TEXT NOT NULL,
                    model TEXT NOT NULL,
                    selected BOOLEAN,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES chats (id),
                    FOREIGN KEY (parent_id) REFERENCES messages (id)
                );

                -- Copy existing data
                INSERT INTO messages_new 
                SELECT * FROM messages;

                -- Drop old table and rename new one
                DROP TABLE messages;
                ALTER TABLE messages_new RENAME TO messages;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create models table",
            sql: r#"
                CREATE TABLE models (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('anthropic', 'openai', 'gemini')),
                    api_key TEXT,
                    model_id TEXT NOT NULL,
                    system_prompt TEXT,
                    request_template JSON NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_enabled BOOLEAN DEFAULT 1
                );

                -- Insert default models
                INSERT INTO models (id, name, type, api_key, model_id, system_prompt, request_template, is_enabled) VALUES
                ('claude', 'Claude 3.5 Sonnet', 'anthropic', NULL, 'claude-3-5-sonnet-20241022', 'You are a helpful AI assistant. Please provide clear and concise responses.', 
                    '{
                        "model": "claude-3-5-sonnet-20241022",
                        "max_tokens": 8192,
                        "messages": [{"role":"user","content":"{{messages}}"}],
                        "system": "You are a helpful AI assistant. Please provide clear and concise responses."
                    }',
                    1
                ),
                ('gpt', 'GPT-4o', 'openai', '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', 'gpt-4o',
                    NULL,
                    '{
                        "model": "gpt-4o",
                        "messages": [{"role":"{{role}}","content":"{{content}}"}],
                        "stream": true
                    }',
                    1
                ),
                ('o1', 'O1', 'openai', NULL, 'o1',
                    NULL,
                    '{
                        "model": "o1",
                        "messages": [{"role":"{{role}}","content":"{{content}}"}],
                        "stream": false
                    }',
                    1
                ),
                ('gemini', 'Gemini Flash 2.0', 'gemini', NULL, 'gemini-2.0-flash-exp',
                    'You are a helpful AI assistant. Please provide clear and concise responses.',
                    '{
                        "model": "gemini-2.0-flash-exp",
                        "messages": [],
                        "system": "You are a helpful AI assistant. Please provide clear and concise responses.",
                        "useGrounding": false
                    }',
                    1
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add model ordering and selection",
            sql: r#"
                -- Add new columns to models table
                ALTER TABLE models ADD COLUMN display_order INTEGER;
                ALTER TABLE models ADD COLUMN is_selected BOOLEAN DEFAULT 0;

                -- Set initial display order for existing models
                UPDATE models SET display_order = CASE id
                    WHEN 'claude' THEN 1
                    WHEN 'gpt' THEN 2
                    WHEN 'o1' THEN 3
                    WHEN 'gemini' THEN 4
                    ELSE 999
                END;

                -- Select first two models by default
                UPDATE models SET is_selected = 1 WHERE id IN ('claude', 'gpt');
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add updated_at column to chats",
            sql: "
                -- Add updated_at column to chats table
                ALTER TABLE chats ADD COLUMN updated_at DATETIME;
                
                -- Initialize updated_at with created_at for existing rows
                UPDATE chats SET updated_at = created_at WHERE updated_at IS NULL;
                
                -- Create trigger to automatically update updated_at
                CREATE TRIGGER IF NOT EXISTS update_chats_timestamp 
                AFTER UPDATE ON chats
                BEGIN
                    UPDATE chats SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.id;
                END;

                -- Also update updated_at when a new message is added
                CREATE TRIGGER IF NOT EXISTS update_chats_timestamp_on_message 
                AFTER INSERT ON messages
                BEGIN
                    UPDATE chats SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.chat_id;
                END;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add pinned column to chats",
            sql: "
                -- Add pinned column to chats table with NOT NULL constraint and default to false
                ALTER TABLE chats ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT 0;
                
                -- Create index for faster querying of pinned chats
                CREATE INDEX IF NOT EXISTS idx_chats_pinned ON chats(pinned);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add head_id to chats",
            sql: "
                -- Add head_id column to chats table
                ALTER TABLE chats ADD COLUMN head_id TEXT;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add short_name to models",
            sql: "
                -- Add short_name column to models table
                ALTER TABLE models ADD COLUMN short_name TEXT;

                -- Update existing models with short names
                UPDATE models SET short_name = CASE id
                    WHEN 'claude' THEN 'Claude'
                    WHEN 'gpt' THEN 'GPT-4'
                    WHEN 'o1' THEN 'O1'
                    WHEN 'gemini' THEN 'Gemini'
                    ELSE substr(name, 1, instr(name || ' ', ' ') - 1)
                END;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add ollama to model types",
            sql: r#"
                -- Create a new models table with updated type constraint
                CREATE TABLE models_new (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('anthropic', 'openai', 'gemini', 'ollama')),
                    api_key TEXT,
                    model_id TEXT NOT NULL,
                    system_prompt TEXT,
                    request_template JSON NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_enabled BOOLEAN DEFAULT 1,
                    display_order INTEGER,
                    is_selected BOOLEAN DEFAULT 0,
                    short_name TEXT
                );

                -- Copy data from old table
                INSERT INTO models_new SELECT * FROM models;

                -- Drop old table and rename new one
                DROP TABLE models;
                ALTER TABLE models_new RENAME TO models;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add lmstudio to model types",
            sql: r#"
                -- Create a new models table with updated type constraint
                CREATE TABLE models_new (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('anthropic', 'openai', 'gemini', 'ollama', 'lmstudio')),
                    api_key TEXT,
                    model_id TEXT NOT NULL,
                    system_prompt TEXT,
                    request_template JSON NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_enabled BOOLEAN DEFAULT 1,
                    display_order INTEGER,
                    is_selected BOOLEAN DEFAULT 0,
                    short_name TEXT
                );

                -- Copy data from old table
                INSERT INTO models_new SELECT * FROM models;

                -- Drop old table and rename new one
                DROP TABLE models;
                ALTER TABLE models_new RENAME TO models;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add gemini thinking model",
            sql: r#"
                -- Insert new Gemini Thinking model
                INSERT INTO models (
                    id, name, type, api_key, model_id, 
                    system_prompt, request_template, 
                    is_enabled, display_order, is_selected, short_name
                ) VALUES (
                    'gemini-thinking',
                    'Gemini Flash Thinking',
                    'gemini',
                    NULL,
                    'gemini-2.0-flash-thinking-exp',
                    'You are a helpful AI assistant. Please provide clear and concise responses.',
                    '{
                        "model": "gemini-2.0-flash-thinking-exp",
                        "messages": [],
                        "system": "You are a helpful AI assistant. Please provide clear and concise responses.",
                        "useGrounding": false
                    }',
                    1,
                    5,
                    1,
                    'Gemini T'
                );

                -- Update display order of other models if needed
                UPDATE models 
                SET display_order = CASE id
                    WHEN 'claude' THEN 1
                    WHEN 'gpt' THEN 2
                    WHEN 'o1' THEN 3
                    WHEN 'gemini' THEN 4
                    WHEN 'gemini-thinking' THEN 5
                    ELSE display_order
                END
                WHERE id IN ('claude', 'gpt', 'o1', 'gemini', 'gemini-thinking');
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "add perplexity to model types",
            sql: r#"
                -- Create a new models table with updated type constraint
                CREATE TABLE models_new (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('anthropic', 'openai', 'gemini', 'ollama', 'lmstudio', 'perplexity')),
                    api_key TEXT,
                    model_id TEXT NOT NULL,
                    system_prompt TEXT,
                    request_template JSON NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_enabled BOOLEAN DEFAULT 1,
                    display_order INTEGER,
                    is_selected BOOLEAN DEFAULT 0,
                    short_name TEXT
                );

                -- Copy data from old table
                INSERT INTO models_new SELECT * FROM models;

                -- Drop old table and rename new one
                DROP TABLE models;
                ALTER TABLE models_new RENAME TO models;

                -- Add default Perplexity model (disabled by default)
                INSERT INTO models (
                    id, name, type, api_key, model_id,
                    system_prompt, request_template,
                    is_enabled, display_order, is_selected, short_name
                ) VALUES (
                    'perplexity-sonar',
                    'Perplexity Sonar',
                    'perplexity',
                    NULL,
                    'llama-3.1-sonar-large-128k-online',
                    NULL,
                    '{"model":"llama-3.1-sonar-large-128k-online","messages":[{"role":"{{role}}","content":"{{content}}"}],"stream":true}',
                    0,
                    6,
                    0,
                    'Sonar'
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "set default enabled state for Gemini and Perplexity models",
            sql: r#"
                -- Enable Gemini models
                UPDATE models SET is_enabled = 1 
                WHERE type = 'gemini' 
                AND model_id IN ('gemini-2.0-flash-exp', 'gemini-2.0-flash-thinking-exp');

                -- Enable Perplexity models
                UPDATE models SET is_enabled = 1 
                WHERE type = 'perplexity';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "set Gemini Flash 2.0 as selected instead of Thinking",
            sql: r#"
                -- Deselect Gemini Flash Thinking
                UPDATE models SET is_selected = 0 
                WHERE model_id = 'gemini-2.0-flash-thinking-exp';

                -- Select Gemini Flash 2.0
                UPDATE models SET is_selected = 1 
                WHERE model_id = 'gemini-2.0-flash-exp';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "add attachments column to messages",
            sql: r#"
                -- Add attachments column to messages table as a JSON array
                ALTER TABLE messages ADD COLUMN attachments TEXT;

                -- Create an index for faster querying of messages with attachments
                CREATE INDEX IF NOT EXISTS idx_messages_attachments ON messages((json_valid(attachments)));
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "add message_sets and update messages table",
            kind: MigrationKind::Up,
            sql: r#"
                -- Create message_sets table
                CREATE TABLE message_sets (
                    id TEXT PRIMARY KEY,
                    chat_id TEXT NOT NULL,
                    parent_id TEXT,
                    type TEXT NOT NULL CHECK (type IN ('user', 'ai')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES chats (id)
                );

                -- Create new messages table
                CREATE TABLE messages_new (
                    id TEXT PRIMARY KEY,
                    message_set_id TEXT NOT NULL,
                    chat_id TEXT NOT NULL,
                    text TEXT NOT NULL,
                    model TEXT NOT NULL,
                    attachments TEXT,
                    selected BOOLEAN,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (message_set_id) REFERENCES message_sets (id),
                    FOREIGN KEY (chat_id) REFERENCES chats (id)
                );

                -- Archive old messages table and rename new one
                ALTER TABLE messages RENAME TO messages_archive_20250102;
                ALTER TABLE messages_new RENAME TO messages;
            "#,
        },
        Migration {
            version: 18,
            description: "migrate messages_archive_20250102 to new messages + message_sets",
            kind: MigrationKind::Up,
            sql: r#"
-------------------------------------------------------------------------------
-- 1) Build a temp_hierarchy table
-------------------------------------------------------------------------------
DROP TABLE IF EXISTS temp_hierarchy;

CREATE TABLE temp_hierarchy AS
WITH RECURSIVE cte AS (
  -- Base case: messages with no parent
  SELECT
    m.id,
    m.chat_id,
    m.parent_id,
    m.text,
    m.model,
    m.attachments,
    CASE WHEN EXISTS (
      SELECT 1
      FROM messages_archive_20250102 c
      WHERE c.parent_id = m.id
      LIMIT 1
    ) THEN 1 ELSE 0 END AS has_children,
    0 AS level,
    m.created_at
  FROM messages_archive_20250102 m
  WHERE m.parent_id IS NULL

  UNION ALL

  -- Recursive step: child level = parent level + 1
  SELECT
    m.id,
    m.chat_id,
    m.parent_id,
    m.text,
    m.model,
    m.attachments,
    CASE WHEN EXISTS (
      SELECT 1
      FROM messages_archive_20250102 c
      WHERE c.parent_id = m.id
      LIMIT 1
    ) THEN 1 ELSE 0 END,
    cte.level + 1,
    m.created_at
  FROM messages_archive_20250102 m
  JOIN cte ON m.parent_id = cte.id
)
SELECT *
FROM cte;

-------------------------------------------------------------------------------
-- 2) Group by (chat_id, parent_id, model, level) to form sets
-------------------------------------------------------------------------------
DROP TABLE IF EXISTS temp_groupings;

CREATE TABLE temp_groupings AS
SELECT
  chat_id,
  parent_id,
  CASE WHEN model = 'user' THEN 'user' ELSE 'ai' END AS type,
  level,
  chat_id || '|' ||
    COALESCE(parent_id, 'no_parent') || '|' ||
    (CASE WHEN model = 'user' THEN 'user' ELSE 'ai' END) || '|' ||
    level AS group_key
FROM temp_hierarchy
GROUP BY chat_id, parent_id, type, level;

-------------------------------------------------------------------------------
-- 3) Create a parent lookup table for these groups
-------------------------------------------------------------------------------
DROP TABLE IF EXISTS temp_group_parent;

CREATE TABLE temp_group_parent AS
SELECT
  g.group_key,
  g.chat_id,
  g.parent_id,
  g.type,
  g.level,
  CASE
    WHEN p.id IS NULL THEN NULL
    ELSE (
      p.chat_id || '|' ||
      COALESCE(p.parent_id, 'no_parent') || '|' ||
      (CASE WHEN p.model = 'user' THEN 'user' ELSE 'ai' END) || '|' ||
      p.level
    )
  END AS parent_group_key
FROM temp_groupings g
LEFT JOIN temp_hierarchy p
       ON p.id = g.parent_id;

-------------------------------------------------------------------------------
-- 4) Create a temp table that maps group_key → message_set_id
-------------------------------------------------------------------------------
DROP TABLE IF EXISTS temp_message_sets;

CREATE TABLE temp_message_sets (
  group_key TEXT PRIMARY KEY,
  message_set_id TEXT,
  chat_id TEXT NOT NULL,
  parent_group_key TEXT,
  parent_message_set_id TEXT,
  type TEXT NOT NULL,
  level INT NOT NULL
);

INSERT INTO temp_message_sets (group_key, message_set_id, chat_id, parent_group_key, type, level)
SELECT
  group_key,
  hex(randomblob(16)) AS message_set_id,
  chat_id,
  parent_group_key,
  type,
  level
FROM temp_group_parent;

-- Fill in the parent_message_set_id by joining on parent_group_key
UPDATE temp_message_sets
SET parent_message_set_id = pm.message_set_id
FROM temp_message_sets pm
WHERE temp_message_sets.parent_group_key = pm.group_key;

-------------------------------------------------------------------------------
-- 5) Insert into the real message_sets table
-------------------------------------------------------------------------------
INSERT INTO message_sets (id, chat_id, parent_id, type)
SELECT
  t.message_set_id AS id,
  t.chat_id,
  t.parent_message_set_id AS parent_id,
  t.type
FROM temp_message_sets t;

-------------------------------------------------------------------------------
-- 6) Finally, insert messages into the new messages table
-------------------------------------------------------------------------------
INSERT INTO messages (id, message_set_id, chat_id, text, model, attachments, selected, created_at)
SELECT
  h.id,
  ms.message_set_id,
  h.chat_id,
  h.text,
  h.model,
  h.attachments,
  CASE WHEN h.has_children = 1 THEN 1 ELSE 0 END,
  h.created_at
FROM temp_hierarchy h
JOIN temp_groupings g
   ON g.chat_id = h.chat_id
   AND (
     (g.parent_id IS NULL AND h.parent_id IS NULL)
     OR g.parent_id = h.parent_id
   )
   AND (CASE WHEN h.model = 'user' THEN 'user' ELSE 'ai' END) = g.type
   AND h.level = g.level
JOIN temp_message_sets ms
   ON ms.group_key = g.group_key;
                    "#,
        },
        Migration {
            version: 19,
            description: "add server_url column to models table",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add server_url column to models table
                ALTER TABLE models ADD COLUMN server_url TEXT;

                -- Set default server URL for LM Studio models
                UPDATE models 
                SET server_url = 'http://localhost:1234/v1'
                WHERE type = 'lmstudio';
            "#,
        },
        Migration {
            version: 20,
            description: "add cascade delete triggers for chats",
            kind: MigrationKind::Up,
            sql: "
                -- Create trigger to delete message_sets when a chat is deleted
                CREATE TRIGGER IF NOT EXISTS delete_chat_message_sets
                BEFORE DELETE ON chats
                FOR EACH ROW
                BEGIN
                    -- First delete all messages associated with the chat
                    DELETE FROM messages WHERE chat_id = OLD.id;
                    
                    -- Then delete all message_sets associated with the chat
                    DELETE FROM message_sets WHERE chat_id = OLD.id;
                END;
            ",
        },
        Migration {
            version: 21,
            description: "add openrouter to model types",
            kind: MigrationKind::Up,
            sql: r#"
                -- Create a new models table with updated type constraint
                CREATE TABLE models_new (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('anthropic', 'openai', 'gemini', 'ollama', 'lmstudio', 'perplexity', 'openrouter')),
                    api_key TEXT,
                    model_id TEXT NOT NULL,
                    system_prompt TEXT,
                    request_template JSON NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_enabled BOOLEAN DEFAULT 1,
                    display_order INTEGER,
                    is_selected BOOLEAN DEFAULT 0,
                    short_name TEXT,
                    server_url TEXT
                );

                -- Copy data from old table
                INSERT INTO models_new SELECT * FROM models;

                -- Drop old table and rename new one
                DROP TABLE models;
                ALTER TABLE models_new RENAME TO models;
            "#,
        },
        Migration {
            version: 22,
            description: "add app_metadata table",
            sql: r#"
                -- Create app_metadata table for storing application-level settings
                CREATE TABLE IF NOT EXISTS app_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "remove head_id from chats",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE chats DROP COLUMN head_id;
            "#,
        },
        Migration {
            version: 24,
            description: "new models and model_configs tables",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE models RENAME TO models_archive_20250111;

                CREATE TABLE models (
                    id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    is_enabled BOOLEAN DEFAULT 1,
                    supported_attachment_types TEXT NOT NULL CHECK ( -- see Models.ts for list of possible supported attachment types
                        json_valid(supported_attachment_types)
                    )
                );

                CREATE TABLE model_configs (
                    id TEXT PRIMARY KEY, -- uuid
                    model_id TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    author TEXT NOT NULL CHECK (author IN ('user', 'system')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    system_prompt TEXT NOT NULL,
                    is_default BOOLEAN DEFAULT 0,
                    FOREIGN KEY (model_id) REFERENCES models (id)
                );

                -- migrate the model ids in the messages table so that
                UPDATE messages SET model = 'anthropic::claude-3-5-sonnet-latest' WHERE model = 'claude';
                UPDATE messages SET model = 'openai::gpt-4o' WHERE model = 'gpt';
                UPDATE messages SET model = 'openai::gpt-4o' WHERE model = 'gpt-4o';
                UPDATE messages SET model = 'openai::o1' WHERE model = 'o1';
                UPDATE messages SET model = 'perplexity::llama-3.1-sonar-huge-128k-online' WHERE model = 'perplexity-sonar';
                UPDATE messages SET model = 'google::gemini-2.0-flash-exp' WHERE model = 'gemini';
                UPDATE messages SET model = 'google::gemini-2.0-flash-thinking-exp' WHERE model = 'gemini-thinking';

                UPDATE messages
                SET model = 'unknown_provider::unknown_model::'
                    || COALESCE(
                        (SELECT mdl.name
                        FROM models_archive_20250111 AS mdl
                        WHERE mdl.id = messages.model),
                        'Unknown sender' -- default
                    )
                WHERE model NOT IN (
                    'anthropic::claude-3-5-sonnet-latest',
                    'openai::gpt-4o',
                    'openai::o1',
                    'perplexity::llama-3.1-sonar-huge-128k-online',
                    'google::gemini-2.0-flash-exp',
                    'google::gemini-2.0-flash-thinking-exp',
                    'user'
                );
            "#,
        },
        Migration {
            version: 25,
            description: "add selected_model_config_ids column to chats",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE chats ADD COLUMN selected_model_config_ids TEXT NOT NULL DEFAULT '[]' CHECK (
                    json_valid(selected_model_config_ids)
                );
            "#,
        },
        Migration {
            version: 26,
            description: "add built-in models and model_configs",
            kind: MigrationKind::Up,
            sql: r#"
            INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                ('openai::gpt-4o', 'GPT-4o', 1, '["image","text"]'),
                ('anthropic::claude-3-5-sonnet-latest', 'Claude 3.5 Sonnet', 1, '["image","text","pdf"]'),
                ('openai::o1', 'o1', 1, '["image","text"]'),
                ('perplexity::llama-3.1-sonar-huge-128k-online', 'Perplexity 3.1 Huge', 1, '["text"]');

            -- NOTE: these basic model configs should always have id = model_id
            INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                -- default model configs
                ('system', 'openai::gpt-4o', 'openai::gpt-4o', 'GPT-4o', '', 1),
                ('system', 'anthropic::claude-3-5-sonnet-latest', 'anthropic::claude-3-5-sonnet-latest', 'Claude 3.5 Sonnet', '', 1),

                -- non-default model configs
                ('system', 'openai::o1', 'openai::o1', 'o1', '', 0),
                ('system', 'perplexity::llama-3.1-sonar-huge-128k-online', 'perplexity::llama-3.1-sonar-huge-128k-online', 'Perplexity', '', 0);
            "#,
        },
        Migration {
            version: 27,
            description: "add google gemini model",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-2.0-flash-exp', 'Gemini 2.0 Flash', 1, '["text","image"]');
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'google::gemini-2.0-flash-exp', 'google::gemini-2.0-flash-exp', 'Gemini 2.0 Flash', '', 1);
            "#,
        },
        Migration {
            version: 28,
            description: "add google gemini thinking model",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-2.0-flash-thinking-exp', 'Gemini 2.0 Flash Thinking', 1, '["text","image"]');
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'google::gemini-2.0-flash-thinking-exp', 'google::gemini-2.0-flash-thinking-exp', 'Gemini 2.0 Flash Thinking', '', 0);
            "#,
        },
        Migration {
            version: 29,
            description: "add is_loading column to attachments json column in messages table",
            kind: MigrationKind::Up,
            sql: r#"
                UPDATE messages
                SET attachments = (
                    SELECT json_group_array(json_set(value, '$.is_loading', json('false')))
                    FROM json_each(attachments)
                )
                WHERE attachments IS NOT NULL;
            "#,
        },
        Migration {
            version: 30,
            description: "all models support webpage attachments",
            kind: MigrationKind::Up,
            sql: r#"
                UPDATE models
                SET supported_attachment_types = (
                    SELECT json_group_array(value)
                    FROM (
                        SELECT DISTINCT value
                        FROM json_each(supported_attachment_types)
                        UNION ALL
                        SELECT 'webpage'
                        WHERE NOT EXISTS (
                            SELECT 1 
                            FROM json_each(supported_attachment_types)
                            WHERE value = 'webpage'
                        )
                    )
                );
            "#,
        },
        Migration {
            version: 31,
            description: "add selected_model_config_ids to app_metadata + remove from chats",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR IGNORE INTO app_metadata (key, value) VALUES (
                    'selected_model_config_ids',
                    '["anthropic::claude-3-5-sonnet-latest","openai::gpt-4o","google::gemini-2.0-flash-exp"]'
                );
                ALTER TABLE chats DROP COLUMN selected_model_config_ids;
            "#,
        },
        Migration {
            version: 32,
            description: "add quick_chat column to chats",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE chats ADD COLUMN quick_chat BOOLEAN NOT NULL DEFAULT 0;
            "#,
        },
        Migration {
            version: 33,
            description: "add quick_chat_model_config_id row to app_metadata",
            kind: MigrationKind::Up,
            sql: r#"
                 INSERT OR IGNORE INTO app_metadata (key, value) VALUES (
                    'quick_chat_model_config_id',
                    'anthropic::claude-3-5-sonnet-latest'
                );
            "#,
        },
        Migration {
            version: 34,
            description: "add 'internal' models and model_configs",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE models ADD COLUMN is_internal BOOLEAN NOT NULL DEFAULT 0;

                -- internal models are not shown to users, not selectable, not configurable

                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types, is_internal) VALUES
                    ('chorus::synthesize', '[Chorus Synthesizer]', 1, '[]', 1);
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'chorus::synthesize', 'chorus::synthesize', '[Chorus Synthesizer]', '', 0);
            "#,
        },
        Migration {
            version: 35,
            description: "add has_dismissed_onboarding to app_metadata",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('has_dismissed_onboarding', 'false');
            "#,
        },
        Migration {
            version: 36,
            description: "add perplexity sonar and sonar-pro models",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Perplexity Sonar model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('perplexity::sonar', 'Perplexity Sonar', 1, '["text","webpage"]'),
                    ('perplexity::sonar-pro', 'Perplexity Sonar Pro', 1, '["text","webpage"]');

                -- Add default configs for both models
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'perplexity::sonar', 'perplexity::sonar', 'Perplexity Sonar', '', 0),
                    ('system', 'perplexity::sonar-pro', 'perplexity::sonar-pro', 'Perplexity Sonar Pro', '', 0);
            "#,
        },
        Migration {
            version: 37,
            description: "update old perplexity model name to indicate deprecation",
            kind: MigrationKind::Up,
            sql: r#"
                -- Update the display name of the old Perplexity model
                UPDATE model_configs 
                SET display_name = 'Perplexity Llama 3.1 (Deprecated)'
                WHERE id = 'perplexity::llama-3.1-sonar-huge-128k-online';
            "#,
        },
        Migration {
            version: 38,
            description: "add is_deprecated column to models table",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add is_deprecated column to models table
                ALTER TABLE models ADD COLUMN is_deprecated BOOLEAN NOT NULL DEFAULT 0;

                -- Mark the old Perplexity model as deprecated
                UPDATE models 
                SET is_deprecated = 1
                WHERE id = 'perplexity::llama-3.1-sonar-huge-128k-online';
            "#,
        },
        Migration {
            version: 39,
            description: "add show_chat_flow_hint to app_metadata",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('show_chat_flow_hint', 'true');
            "#,
        },
        Migration {
            version: 40,
            description: "add show_only_selected to app_metadata",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('show_only_selected', 'false');
            "#,
        },
        Migration {
            version: 41,
            description: "add deepseek models",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('deepseek::deepseek-chat', 'DeepSeek Chat', 1, '["text", "webpage"]'),
                    ('deepseek::deepseek-reasoner', 'DeepSeek Reasoner (R1)', 1, '["text", "webpage"]');

                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'deepseek::deepseek-chat', 'deepseek::deepseek-chat', 'DeepSeek Chat', '', 0),
                    ('system', 'deepseek::deepseek-reasoner', 'deepseek::deepseek-reasoner', 'DeepSeek Reasoner (R1)', '', 0);
            "#,
        },
        Migration {
            version: 42,
            description: "add groq models",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('groq::llama-3.3-70b-versatile', 'Groq Llama 3.3 (70B)', 1, '["text", "webpage"]');

                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'groq::llama-3.3-70b-versatile', 'groq::llama-3.3-70b-versatile', 'Groq Llama 3.3 (70B)', '', 0);
            "#,
        },
        Migration {
            version: 43,
            description: "add o3-mini",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::o3-mini', 'o3-mini', 1, '["text", "webpage"]');

                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'openai::o3-mini', 'openai::o3-mini', 'o3-mini', '', 0);
            "#,
        },
        Migration {
            version: 44,
            description: "add vision_mode_enabled column to app_metadata",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('vision_mode_enabled', 'false');
            "#,
        },
        Migration {
            version: 45,
            description: "add flash model and update exp model name",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add the new flash model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-2.0-flash', 'Gemini 2.0 Flash', 1, '["text","image","webpage"]');

                -- Add its default config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'google::gemini-2.0-flash', 'google::gemini-2.0-flash', 'Gemini 2.0 Flash', '', 0);

                -- Update the display name of the experimental model
                UPDATE models 
                SET display_name = 'Gemini 2.0 Flash (Experimental)'
                WHERE id = 'google::gemini-2.0-flash-exp';

                UPDATE model_configs
                SET display_name = 'Gemini 2.0 Flash (Experimental)'
                WHERE id = 'google::gemini-2.0-flash-exp';
            "#,
        },
        Migration {
            version: 46,
            description: "add new gemini models (Flash Lite and Pro)",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add new Gemini models
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-2.0-flash-lite-preview-02-05', 'Gemini 2.0 Flash Lite (Preview)', 1, '["text","image","webpage"]'),
                    ('google::gemini-2.0-pro-exp-02-05', 'Gemini 2.0 Pro (Experimental)', 1, '["text","image","webpage"]');

                -- Add default configs for both models
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'google::gemini-2.0-flash-lite-preview-02-05', 'google::gemini-2.0-flash-lite-preview-02-05', 'Gemini 2.0 Flash Lite (Preview)', '', 0),
                    ('system', 'google::gemini-2.0-pro-exp-02-05', 'google::gemini-2.0-pro-exp-02-05', 'Gemini 2.0 Pro (Experimental)', '', 0);
            "#,
        },
        Migration {
            version: 47,
            description: "update gemini flash model defaults",
            kind: MigrationKind::Up,
            sql: r#"
                -- Make Flash 2.0 a default model
                UPDATE model_configs
                SET is_default = 1
                WHERE id = 'google::gemini-2.0-flash';

                -- Make Flash 2.0 Experimental no longer a default
                UPDATE model_configs
                SET is_default = 0
                WHERE id = 'google::gemini-2.0-flash-exp';
            "#,
        },
        Migration {
            version: 48,
            description: "mark gemini flash exp as deprecated",
            kind: MigrationKind::Up,
            sql: r#"
                -- Mark the experimental model as deprecated
                UPDATE models
                SET is_deprecated = 1,
                    display_name = 'Gemini 2.0 Flash (Deprecated)'
                WHERE id = 'google::gemini-2.0-flash-exp';

                -- Update the model config display name to match
                UPDATE model_configs
                SET display_name = 'Gemini 2.0 Flash (Deprecated)'
                WHERE id = 'google::gemini-2.0-flash-exp';
            "#,
        },
        Migration {
            version: 49,
            description: "add default quick chat model config",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR IGNORE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('user', '24711c64-725c-4bdd-b5eb-65fe1dbfcde8', 'anthropic::claude-3-5-sonnet-latest', 'Ambient Claude',
                    'Respond concisely. Use one or two sentences if possible.

If the user has vision mode enabled, whenever they send a message, the system will automatically attach a screenshot showing the current state of their computer screen. Use these screenshots as needed to help answer the user''s questions. There''s no need to describe the screenshot or comment on it except insofar as it relates to the user''s question.',
                    0);

                -- update only if user has the default selected
                UPDATE app_metadata
                SET value = '24711c64-725c-4bdd-b5eb-65fe1dbfcde8'
                WHERE key = 'quick_chat_model_config_id'
                AND value = 'anthropic::claude-3-5-sonnet-latest';
            "#,
        },
        Migration {
            version: 50,
            description: "update selected_model_config_ids to use new gemini flash model. replaces experimental version for new users.",
            kind: MigrationKind::Up,
            sql: r#"
                -- Update selected_model_config_ids to use new gemini flash model instead of experimental version
                UPDATE app_metadata
                SET value = json_array(
                    CASE 
                        WHEN json_extract(value, '$[0]') = 'google::gemini-2.0-flash-exp' THEN 'google::gemini-2.0-flash'
                        ELSE json_extract(value, '$[0]')
                    END,
                    CASE 
                        WHEN json_extract(value, '$[1]') = 'google::gemini-2.0-flash-exp' THEN 'google::gemini-2.0-flash'
                        ELSE json_extract(value, '$[1]')
                    END,
                    CASE 
                        WHEN json_extract(value, '$[2]') = 'google::gemini-2.0-flash-exp' THEN 'google::gemini-2.0-flash'
                        ELSE json_extract(value, '$[2]')
                    END
                )
                WHERE key = 'selected_model_config_ids'
                AND value LIKE '%"google::gemini-2.0-flash-exp"%';
            "#,
        },
        Migration {
            version: 51,
            description: "add streaming_token column to messages table",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE messages ADD COLUMN streaming_token TEXT;
            "#,
        },
        Migration {
            version: 52,
            description: "add message state",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE messages ADD COLUMN state TEXT CHECK (state IN ('streaming', 'idle')) DEFAULT 'streaming';
            "#,
        },
        Migration {
            version: 53,
            description: "add projects table",
            kind: MigrationKind::Up,
            sql: r#"
                -- create projects table

                    CREATE TABLE projects (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );

                    INSERT OR REPLACE INTO projects (id, name) VALUES ('default', 'Default');
                    INSERT OR REPLACE INTO projects (id, name) VALUES ('quick-chat', 'Ambient Chat');

                -- add project_id column to chats table
                
                    ALTER TABLE chats ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default';

                    UPDATE chats SET project_id = 'quick-chat' WHERE quick_chat = 1;
                
                    -- On insert make sure the referenced project exists.
                    CREATE TRIGGER verify_chats_project_id_insert
                    BEFORE INSERT ON chats
                    FOR EACH ROW
                    WHEN ((SELECT count(*) FROM projects WHERE id = NEW.project_id) = 0)
                    BEGIN
                        SELECT RAISE(FAIL, 'Invalid project_id on insert: no matching project.');
                    END;

                    -- On update make sure the new project_id exists.
                    CREATE TRIGGER verify_chats_project_id_update
                    BEFORE UPDATE OF project_id ON chats
                    FOR EACH ROW
                    WHEN ((SELECT count(*) FROM projects WHERE id = NEW.project_id) = 0)
                    BEGIN
                        SELECT RAISE(FAIL, 'Invalid project_id on update: no matching project.');
                    END;

                    -- Cascade delete chats when a project is deleted.
                    CREATE TRIGGER delete_chats_on_project_delete
                    AFTER DELETE ON projects
                    FOR EACH ROW
                    BEGIN
                        DELETE FROM chats WHERE project_id = OLD.id;
                    END;
            "#,
        },
        Migration {
            version: 54,
            description: "add error state to messages",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE messages ADD COLUMN error_message TEXT;
            "#,
        },
        Migration {
            version: 55,
            description: "update default selected model configs to sonnet and o3-mini",
            kind: MigrationKind::Up,
            sql: r#"
                -- Update selected_model_config_ids to use just sonnet and o3-mini if user has the default value
                UPDATE app_metadata
                SET value = '["anthropic::claude-3-5-sonnet-latest","openai::o3-mini"]'
                WHERE key = 'selected_model_config_ids'
                AND value = '["anthropic::claude-3-5-sonnet-latest","openai::gpt-4o","google::gemini-2.0-flash"]';
            "#,
        },
        Migration {
            version: 56,
            description: "ensure only one selected message per set on message insert and delete",
            kind: MigrationKind::Up,
            sql: r#"
                -- When inserting a message, if it's the only one in its set, select it
                CREATE TRIGGER ensure_message_selected_on_insert
                AFTER INSERT ON messages
                FOR EACH ROW
                BEGIN
                    UPDATE messages 
                    SET selected = 1
                    WHERE id = NEW.id
                    AND (
                        SELECT COUNT(*) 
                        FROM messages 
                        WHERE message_set_id = NEW.message_set_id
                    ) = 1;
                END;

                -- When deleting a message, if it was selected and there are other messages,
                -- select another message from the set
                CREATE TRIGGER ensure_message_selected_on_delete
                AFTER DELETE ON messages
                FOR EACH ROW
                WHEN OLD.selected = 1
                BEGIN
                    UPDATE messages 
                    SET selected = 1
                    WHERE id = (
                        SELECT id
                        FROM messages
                        WHERE message_set_id = OLD.message_set_id
                        ORDER BY model
                        LIMIT 1
                    );
                END;
            "#,
        },
        Migration {
            version: 57,
            description: "add image support for specific openrouter models",
            kind: MigrationKind::Up,
            sql: r#"
                -- Update supported_attachment_types for specific OpenRouter models to include images
                UPDATE models
                SET supported_attachment_types = json_array('text', 'image', 'webpage')
                WHERE id IN (
                    'openrouter::deepseek/deepseek-r1',
                    'openrouter::deepseek/deepseek-chat',
                    'openrouter::google/gemini-2.0-flash-001',
                    'openrouter::anthropic/claude-3-sonnet',
                    'openrouter::anthropic/claude-3.5-sonnet',
                    'openrouter::anthropic/claude-3.5-haiku',
                    'openrouter::google/gemini-flash-1.5',
                    'openrouter::google/gemini-pro',
                    'openrouter::google/gemini-pro-vision',
                    'openrouter::meta-llama/llama-3.3-70b-instruct',
                    'openrouter::openai/chatgpt-4o-latest',
                    'openrouter::openai/gpt-3.5-turbo',
                    'openrouter::openai/gpt-4',
                    'openrouter::openai/gpt-4o',
                    'openrouter::openai/gpt-4o-mini',
                    'openrouter::openai/o1',
                    'openrouter::openai/o1-preview'
                );
            "#,
        },
        Migration {
            version: 58,
            description: "add claude-3-7-sonnet model and thinking variant",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Claude 3.7 Sonnet models (regular and thinking variant)
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('anthropic::claude-3-7-sonnet-latest', 'Claude 3.7 Sonnet', 1, '["text", "image", "webpage", "pdf"]'),
                    ('anthropic::claude-3-7-sonnet-latest', 'Claude 3.7 Sonnet Thinking', 1, '["text", "image", "webpage", "pdf"]');

                -- Add default configs for both Claude 3.7 Sonnet variants
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', '2b1c042c-82f8-4913-9cee-03ed71361f03', 'anthropic::claude-3-7-sonnet-latest', 'Claude 3.7 Sonnet', '', 1),
                    ('system', "58147fb6-1cd0-4c58-b0f0-2760bc96ef79", 'anthropic::claude-3-7-sonnet-latest', 'Claude 3.7 Sonnet Thinking', '', 0);

                -- Update selected_model_config_ids to use Claude 3.7 instead of 3.5 if user has the default value
                UPDATE app_metadata
                SET value = json_array(
                    '2b1c042c-82f8-4913-9cee-03ed71361f03',
                    json_extract(value, '$[1]')
                )
                WHERE key = 'selected_model_config_ids'
                AND json_extract(value, '$[0]') = 'anthropic::claude-3-5-sonnet-latest';

                -- Update quick chat model model config id to use Claude 3.7 if using the default Ambient Claude config
                UPDATE model_configs
                SET model_id = 'anthropic::claude-3-7-sonnet-latest'
                WHERE id = '24711c64-725c-4bdd-b5eb-65fe1dbfcde8';
            "#,
        },
        Migration {
            version: 59,
            description: "add budget_tokens column to model_configs",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add budget_tokens column to model_configs table with a default value of NULL
                ALTER TABLE model_configs ADD COLUMN budget_tokens INTEGER;

                -- Update model_configs to set budget_tokens to 16000 for claude 3.7 thinking
                UPDATE model_configs
                SET budget_tokens = 16000
                WHERE id = '58147fb6-1cd0-4c58-b0f0-2760bc96ef79';
            "#,
        },
        Migration {
            version: 60,
            description: "add is_review column to messages",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE messages ADD COLUMN is_review BOOLEAN DEFAULT 0;
            "#,
        },
        Migration {
            version: 61,
            description: "add review_state column to messages",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE messages ADD COLUMN review_state TEXT CHECK (review_state IN ('pending', 'applied') OR review_state IS NULL);
            "#,
        },
        Migration {
            version: 62,
            description: "add o3-mini model config and reasoning_effort column to model_configs",
            kind: MigrationKind::Up,
            sql: r#"
                -- add reasoning_effort column to model_configs table
                ALTER TABLE model_configs ADD COLUMN reasoning_effort TEXT CHECK (reasoning_effort IN ('low', 'medium', 'high') OR reasoning_effort IS NULL);

                -- Add o3-mini model config with reasoning_effort
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default, reasoning_effort) VALUES
                    ('system', '6f6ee7c9-ae05-4a92-8acc-c40521a21671', 'openai::o3-mini', 'o3-mini-high', '', 0, 'high');
            "#,
        },
        Migration {
            version: 63,
            description: "add gpt 4.5 preview model config and model",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add gpt 4.5 preview model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::gpt-4.5-preview', 'GPT 4.5 Preview', 1, '["text", "image", "webpage"]');

                -- Add gpt 4.5 preview model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'a6429ab6-8d41-4e4e-bfc5-a97f28de928b', 'openai::gpt-4.5-preview', 'GPT 4.5 Preview', '', 0);

            "#,
        },
        Migration {
            version: 64,
            description: "default to review mode",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('review_mode', 'true');
            "#,
        },
        Migration {
            version: 65,
            description: "add needs_reviews_primer to app_metadata",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR IGNORE INTO app_metadata (key, value)
                SELECT 'needs_reviews_primer', 'true'
                WHERE EXISTS (SELECT 1 FROM chats LIMIT 1); -- only run if they've already created a chat
            "#,
        },
        Migration {
            version: 66,
            description: "default to review mode part 2: enforce just one model config selected",
            kind: MigrationKind::Up,
            sql: r#"
                -- enforce just one model config selected
                INSERT OR REPLACE INTO app_metadata (key, value)
                VALUES (
                    'selected_model_config_ids',
                    COALESCE(
                        (
                            SELECT json_array(json_extract(value, '$[0]'))
                            FROM app_metadata
                            WHERE key = 'selected_model_config_ids'
                            AND json_valid(value)
                            AND json_array_length(value) > 0
                        ),
                        '["anthropic::claude-3-7-sonnet"]'
                    )
                );
            "#,
        },
        Migration {
            version: 67,
            description: "add pdf support for openai",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add support for 4o and 4.5 preview
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::gpt-4o', 'GPT 4o', 1, '["text", "image", "webpage", "pdf"]'),
                    ('openai::gpt-4.5-preview', 'GPT 4.5 Preview', 1, '["text", "image", "webpage", "pdf"]');
            "#,
        },
        Migration {
            version: 68,
            description: "add new perplexity models",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add new Perplexity models
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('perplexity::sonar-deep-research', 'Sonar Deep Research', 1, '["text", "webpage"]'),
                    ('perplexity::sonar-reasoning-pro', 'Sonar Reasoning Pro', 1, '["text", "webpage"]'),
                    ('perplexity::r1-1776', 'DeepSeek R1', 1, '["text", "webpage"]');

                -- Add default configs for the new models
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', '5dfdba07-3bad-456d-8267-4aa448d7ae1c', 'perplexity::sonar-deep-research', 'Sonar Deep Research', '', 0),
                    ('system', 'cf3e8565-b491-46f8-8a52-36568c3a7a93', 'perplexity::sonar-reasoning-pro', 'Sonar Reasoning Pro', '', 0),
                    ('system', '666395a0-e6e4-415f-9d1a-4f40d7b0e0a5', 'perplexity::r1-1776', 'DeepSeek R1', '', 0);
            "#,
        },
        Migration {
            version: 69,
            description: "add block_type column to messages",
            kind: MigrationKind::Up,
            sql: r#"
                -- (temporary) add mode column to message_sets table
                ALTER TABLE message_sets ADD COLUMN selected_block_type TEXT NOT NULL DEFAULT 'chat';

                UPDATE message_sets set selected_block_type = 'compare' where id in (
                    SELECT message_set_id
                    FROM messages
                    WHERE is_review = 0
                    GROUP BY message_set_id
                    HAVING COUNT(*) >= 2
                );

                -- chat mode (review)
                UPDATE message_sets set selected_block_type = 'chat' where id in (
                    SELECT message_set_id
                    FROM messages
                    WHERE is_review = 1
                    GROUP BY message_set_id
                );

                -- chat mode (default)
                UPDATE message_sets set selected_block_type = 'chat' where id in (
                    SELECT message_set_id
                    FROM messages
                    GROUP BY message_set_id
                    HAVING COUNT(*) = 1
                );

                -- user mode
                UPDATE message_sets set selected_block_type = 'user' where id in (
                    SELECT id from message_sets where type = 'user'
                );

                -- propagate selected_block_type into messages
                ALTER TABLE messages ADD COLUMN block_type TEXT;
                UPDATE messages SET block_type = (
                    SELECT selected_block_type
                    FROM message_sets
                    WHERE messages.message_set_id = message_sets.id
                );
            "#,
        },
        Migration {
            version: 70,
            description: "deprecate deepseek models",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add deprecation notice to model_configs
                UPDATE models
                SET is_enabled = 0
                WHERE id IN (
                    'deepseek::deepseek-chat',
                    'deepseek::deepseek-reasoner'
                );
            "#,
        },
        Migration {
            version: 71,
            description: "add reviews_enabled to app_metadata",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('reviews_enabled', 'true');
            "#,
        },
        Migration {
            version: 72,
            description: "add current_block_type to app_metadata",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('current_block_type', 'chat');
            "#,
        },
        Migration {
            version: 73,
            description: "migrate selected_model_config_ids to selected_model_config_chat and selected_model_configs_compare",
            kind: MigrationKind::Up,
            sql: r#"
                -- initialize selected_model_config_chat as just the first model in selected_model_config_ids
                INSERT OR REPLACE INTO app_metadata (key, value)
                SELECT 'selected_model_config_chat', json_array(json_extract(value, '$[0]'))
                FROM app_metadata
                WHERE key = 'selected_model_config_ids';

                -- initialize selected_model_configs_compare as all models in selected_model_config_ids
                INSERT OR REPLACE INTO app_metadata (key, value)
                SELECT 'selected_model_configs_compare', value
                FROM app_metadata
                WHERE key = 'selected_model_config_ids';

                -- remove selected_model_config_ids from app_metadata
                DELETE FROM app_metadata WHERE key = 'selected_model_config_ids';
            "#,
        },
        Migration {
            version: 74,
            description: "fix selected_model_config_chat bug",
            kind: MigrationKind::Up,
            sql: r#"
                -- if selected_model_config_chat starts with [, then assume it's a json array,
                -- extract the first element and use that as the selected_model_config_chat
                UPDATE app_metadata
                SET value = json_extract(value, '$[0]')
                WHERE key = 'selected_model_config_chat'
                AND json_valid(value)
                AND json_array_length(value) > 0;
            "#,
        },
        Migration {
            version: 75,
            description: "add o1-pro model config",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add o1-pro model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::o1-pro', 'o1-pro', 1, '["text", "image", "webpage"]');

                -- Add o1-pro model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', '7a894011-f1da-406b-ba11-103f7c7fe4eb', 'openai::o1-pro', 'o1-pro', '', 0);
            "#,
        },
        Migration {
            version: 76,
            description: "add gemini-2.5-pro-exp-03-25 model config",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add gemini-2.5-pro-exp-03-25 model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-2.5-pro-exp-03-25', 'Gemini 2.5 Pro Experimental', 1, '["text", "image", "webpage"]');

                -- Add gemini-2.5-pro-exp-03-25 model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', '1f2287c2-5996-41a9-b091-8f68bb458e22', 'google::gemini-2.5-pro-exp-03-25', 'Gemini 2.5 Pro Experimental', '', 0);

            "#,
        },

        Migration {
            version: 77,
            description: "set quick chat model config to ambient claude for everyone",
            kind: MigrationKind::Up,
            sql: r#"
                -- Update quick_chat_model_config_id to Ambient Claude for everyone
                INSERT OR REPLACE INTO app_metadata (key, value) 
                VALUES ('quick_chat_model_config_id', '24711c64-725c-4bdd-b5eb-65fe1dbfcde8');
            "#,
        },
        Migration {
            version: 78,
            description: "update ambient claude prompt to include bash command capabilities",
            kind: MigrationKind::Up,
            sql: r#"
                -- Update Ambient Claude's system prompt to include bash command capabilities
                UPDATE model_configs
                SET system_prompt = 'Respond concisely. Use one or two sentences if possible.

If you see a screenshot, it means the system has automatically attached a screenshot showing the current user''s computer screen. Use these screenshots as needed to help answer the user''s questions. There''s no need to describe the screenshot or comment on it unless it relates to the user''s question.

If you cannot see a screenshot, it means the user has disabled vision mode, and if they ask something that requires a screenshot, you should ask them to enable vision mode.

You have full access to bash commands on the user''s computer. If you write a bash command in a ```sh markdown block, the user will be able to click ‘run’ to quickly execute the command. Use this to help answer questions or perform tasks if it''s relevant. Assume a MacOS environment.'
                WHERE id = '24711c64-725c-4bdd-b5eb-65fe1dbfcde8';
            "#,
        },
        Migration {
            version: 79,
            description: "add message_drafts table",
            kind: MigrationKind::Up,
            sql: r#"
                -- ideally, we'd save a draft as a message. but for simplicity, for now we'll save it as text
                CREATE TABLE IF NOT EXISTS message_drafts (
                    chat_id TEXT PRIMARY KEY,
                    content TEXT NOT NULL
                );
            "#,
        },
        Migration {
            version: 80,
            description: "add summary column to chats table",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add summary column to chats table
                ALTER TABLE chats ADD COLUMN summary TEXT;
            "#,
        },
        Migration {
            version: 81,
            description: "reset all messages to idle state",
            kind: MigrationKind::Up,
            sql: r#"
                UPDATE messages SET state = 'idle';
            "#,
        },
        Migration {
            version: 82,
            description: "add gpt-4o-mini model config",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add gpt-4o-mini model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::gpt-4o-mini', 'GPT-4o Mini', 1, '["text", "image", "webpage", "pdf"]');

                -- Add gpt-4o-mini model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'openai::gpt-4o-mini', 'openai::gpt-4o-mini', 'GPT-4o Mini', '', 0);
            "#
        },
        Migration {
            version: 83,
            description: "add gemini 2.0 flash model",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Gemini 2.0 Flash model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-2.0-flash', 'Gemini 2.0 Flash', 1, '["text", "image", "webpage"]');

                -- Add Gemini 2.0 Flash model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'google::gemini-2.0-flash', 'google::gemini-2.0-flash', 'Gemini 2.0 Flash', '', 0);
            "#,
        },
        Migration {
            version: 84,
            description: "reset quick chat model config to claude 3.7 sonnet, since we're getting rid of the picker",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO app_metadata (key, value) 
                VALUES ('quick_chat_model_config_id', '24711c64-725c-4bdd-b5eb-65fe1dbfcde8');
            "#,
        },
        Migration {
            version: 85,
            description: "add gemini-2.5-pro-preview-03-25 model and deprecate experimental version",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add gemini-2.5-pro-preview-03-25 model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-2.5-pro-preview-03-25', 'Gemini 2.5 Pro', 1, '["text", "image", "webpage"]');

                -- Add gemini-2.5-pro-preview-03-25 model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'google::gemini-2.5-pro-preview-03-25', 'google::gemini-2.5-pro-preview-03-25', 'Gemini 2.5 Pro', '', 0);

                -- Mark the experimental version as deprecated
                UPDATE models
                SET is_deprecated = 1,
                    display_name = 'Gemini 2.5 Pro Experimental'
                WHERE id = 'google::gemini-2.5-pro-exp-03-25';

                -- Update the model config display name to match
                UPDATE model_configs
                SET display_name = 'Gemini 2.5 Pro Experimental'
                WHERE id = '1f2287c2-5996-41a9-b091-8f68bb458e22'
                AND model_id = 'google::gemini-2.5-pro-exp-03-25';
            "#,
        },
        Migration {
            version: 86,
            description: "add level column to message_sets",
            kind: MigrationKind::Up,
            sql: r#"
                -- First, add the level column to the existing message_sets table
                ALTER TABLE message_sets ADD COLUMN level INTEGER;

                -- Compute and set the level for each message_set using recursive CTE
                WITH RECURSIVE MessageHierarchy AS (
                    -- Base case: get root messages (no parent)
                    SELECT id, 0 as level
                    FROM message_sets 
                    WHERE parent_id IS NULL
                    
                    UNION ALL
                    
                    -- Recursive case: get children
                    SELECT m.id, mh.level + 1
                    FROM message_sets m
                    JOIN MessageHierarchy mh ON m.parent_id = mh.id
                )
                UPDATE message_sets
                SET level = (
                    SELECT mh.level
                    FROM MessageHierarchy mh
                    WHERE mh.id = message_sets.id
                );

                -- Create an index on (chat_id, level) for better query performance
                CREATE INDEX IF NOT EXISTS idx_message_sets_chat_level ON message_sets(chat_id, level);
            "#,
        },
        Migration {
            version: 87,
            description: "rename parent_id to deprecated_parent_id",
            kind: MigrationKind::Up,
            sql: r#"
                -- Rename parent_id to deprecated_parent_id
                ALTER TABLE message_sets RENAME COLUMN parent_id TO deprecated_parent_id;
            "#,
        },
        Migration {
            version: 88,
            description: "add openrouter meta-llama/llama-4-scout model",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Llama 4 Scout model from OpenRouter
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openrouter::meta-llama/llama-4-scout', 'Llama 4 Scout', 1, '["text", "webpage", "image"]');

                -- Add default config for Llama 4 Scout
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'openrouter::meta-llama/llama-4-scout', 'openrouter::meta-llama/llama-4-scout', 'Llama 4 Scout', '', 0);

                -- Add Llama 4 Maverick model from OpenRouter
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openrouter::meta-llama/llama-4-maverick', 'Llama 4 Maverick', 1, '["text", "webpage", "image"]');

                -- Add default config for Llama 4 Maverick
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'openrouter::meta-llama/llama-4-maverick', 'openrouter::meta-llama/llama-4-maverick', 'Llama 4 Maverick', '', 0);
            "#,
        },
        Migration {
            version: 89,
            description: "set quick chat model config to ambient gemini 2.5 pro",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Ambient Gemini config using Gemini 2.5 Pro
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('user', 'google::ambient-gemini-2.5-pro-preview-03-25', 'google::gemini-2.5-pro-preview-03-25', 'Ambient Gemini',
                    'Respond concisely. Use one or two sentences if possible.

If you see a screenshot, it means the system has automatically attached a screenshot showing the current user''''s computer screen. Use these screenshots as needed to help answer the user''''s questions. There''''s no need to describe the screenshot or comment on it unless it relates to the user''''s question.

If you cannot see a screenshot, it means the user has disabled vision mode, and if they ask something that requires a screenshot, you should ask them to enable vision mode.

You have full access to bash commands on the user''''s computer. If you write a bash command in a ```sh markdown block, the user will be able to click ‘run’ to quickly execute the command. Use this to help answer questions or perform tasks if it''''s relevant. Assume a MacOS environment.',
                    0);

                -- Update quick_chat_model_config_id to Ambient Gemini
                INSERT OR REPLACE INTO app_metadata (key, value) 
                VALUES ('quick_chat_model_config_id', 'google::ambient-gemini-2.5-pro-preview-03-25');
            "#,
        },
        Migration {
            version: 90,
            description: "change default chat model config to gemini 2.5 pro",
            kind: MigrationKind::Up,
            sql: r#"
                -- Update the default chat model configuration to Gemini 2.5 Pro
                -- only if the current default is Claude 3.7 Sonnet
                UPDATE app_metadata
                SET value = 'google::gemini-2.5-pro-preview-03-25'
                WHERE key = 'selected_model_config_chat'
                AND value = '2b1c042c-82f8-4913-9cee-03ed71361f03';
            "#,
        },
        Migration {
            version: 91,
            description: "add grok-3-mini-fast-beta model",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add grok-3-mini-fast-beta model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('grok::grok-3-mini-fast-beta', 'Grok 3 Mini Fast', 1, '["text", "webpage", "image"]');

                -- Add default config for grok-3-mini-fast-beta
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'grok::grok-3-mini-fast-beta', 'grok::grok-3-mini-fast-beta', 'Grok 3 Mini Fast', '', 0);

                -- Add grok-3-mini-beta model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('grok::grok-3-mini-beta', 'Grok 3 Mini', 1, '["text", "webpage", "image"]');

                -- Add default config for grok-3-mini-beta
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'grok::grok-3-mini-beta', 'grok::grok-3-mini-beta', 'Grok 3 Mini', '', 0);

                -- Add grok-3-fast-beta model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('grok::grok-3-fast-beta', 'Grok 3 Fast', 1, '["text", "webpage", "image"]');

                -- Add default config for grok-3-fast-beta
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'grok::grok-3-fast-beta', 'grok::grok-3-fast-beta', 'Grok 3 Fast', '', 0);

                -- Add grok-3-beta model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('grok::grok-3-beta', 'Grok 3', 1, '["text", "webpage", "image"]');

                -- Add default config for grok-3-beta
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'grok::grok-3-beta', 'grok::grok-3-beta', 'Grok 3', '', 0);
            "#,
        },
        Migration {
            version: 92,
            description: "add 4.1 openai models",
            kind: MigrationKind::Up,
            sql: r#"
                --- add gpt 4.1 model to models table
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::gpt-4.1', 'GPT-4.1', 1, '["text", "image", "webpage", "pdf"]');

                --- add gpt 4.1 model config to model_configs table
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'openai::gpt-4.1', 'openai::gpt-4.1', 'GPT-4.1', '', 0);

                -- add gpt-4.1-mini model to models table
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::gpt-4.1-mini', 'GPT-4.1 Mini', 1, '["text", "image", "webpage", "pdf"]');

                -- add gpt-4.1-mini model config to model_configs table
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'openai::gpt-4.1-mini', 'openai::gpt-4.1-mini', 'GPT-4.1 Mini', '', 0);
            "#,
        },
        Migration {
            version: 93,
            description: "add o3 and o4-mini openai models",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::o3', 'o3', 1, '["text", "image", "webpage", "pdf"]'),
                    ('openai::o4-mini', 'o4-mini', 1, '["text", "image", "webpage", "pdf"]');

                --- add o3 model config to model_configs table
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'openai::o3', 'openai::o3', 'o3', '', 0),
                    ('system', 'openai::o4-mini', 'openai::o4-mini', 'o4-mini', '', 0);
            "#,
        },
        Migration {
            version: 94,
            description: "add gemini 2.5 flash",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Gemini 2.5 Flash model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-2.5-flash-preview-04-17', 'Gemini 2.5 Flash (Preview)', 1, '["text", "image", "webpage"]');

                -- Add Gemini 2.5 Flash model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'google::gemini-2.5-flash-preview-04-17', 'google::gemini-2.5-flash-preview-04-17', 'Gemini 2.5 Flash (Preview)', '', 0);
            "#
        },
        Migration {
            version: 95,
            description: "add message_parts table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS message_parts (
                    chat_id TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    level INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    tool_calls TEXT,
                    tool_results TEXT,
                    PRIMARY KEY (message_id, level)
                )
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 96,
            description: "add toolsets config table",
            kind: MigrationKind::Up,
            sql: r#"
                CREATE TABLE IF NOT EXISTS toolsets_config (
                    toolset_name TEXT, -- "github"
                    parameter_id TEXT, -- "personalAccessToken"
                    parameter_value TEXT, -- "github_pat_XXXXXXXX"
                    PRIMARY KEY (toolset_name, parameter_id)
                );
            "#,
        },
        Migration {
            version: 97,
            description: "add table for custom toolsets",
            kind: MigrationKind::Up,
            sql: r#"
                CREATE TABLE IF NOT EXISTS custom_toolsets (
                    name TEXT PRIMARY KEY,
                    command TEXT,
                    args TEXT,
                    env JSON CHECK (json_valid(env)),
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            "#,
        },
        Migration {
            version: 98,
            description: "update gemini 2.5 pro 05-06",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Gemini 2.5 Pro model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-2.5-pro-latest', 'Gemini 2.5 Pro', 1, '["text", "image", "webpage"]');

                -- Add Gemini 2.5 Pro model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'google::gemini-2.5-pro-latest', 'google::gemini-2.5-pro-latest', 'Gemini 2.5 Pro', '', 0);

                -- Mark the old model and model config as deprecated, and put 03-25 in their display names
                UPDATE models SET is_deprecated = 1, display_name = 'Gemini 2.5 Pro (Preview 03-25)' WHERE id = 'google::gemini-2.5-pro-preview-03-25';
                UPDATE model_configs SET display_name = 'Gemini 2.5 Pro (Preview 03-25)' WHERE id = 'google::gemini-2.5-pro-preview-03-25';

                -- Update the default chat model configuration to new Gemini 2.5 Pro
                -- only if the current default is previous Gemini 2.5 Pro
                UPDATE app_metadata
                SET value = 'google::gemini-2.5-pro-latest'
                WHERE key = 'selected_model_config_chat'
                AND value = 'google::gemini-2.5-pro-preview-03-25';
            "#,
        },
        Migration {
            version: 99,
            description: "add level column to messages table",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE messages ADD COLUMN level INTEGER;
            "#,
        },
        Migration {
            version: 100,
            description: "set message level to 0 for existing tools messages",
            kind: MigrationKind::Up,
            sql: r#"
                UPDATE messages SET level = 0 WHERE block_type = 'tools' AND level IS NULL;
            "#,
        },
        Migration {
            version: 101,
            description: "tool mode on by default",
            kind: MigrationKind::Up,
            sql: r#"
                UPDATE app_metadata SET value = 'tools' WHERE key = 'current_block_type';
            "#,
        },
        Migration {
            version: 102,
            description: "add is_new_chat column to chats, delete old chats with no messages",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add is_new_chat column to chats table
                ALTER TABLE chats ADD COLUMN is_new_chat BOOLEAN NOT NULL DEFAULT 0;
                
                -- Create trigger to automatically set is_new_chat to false when messages are added
                CREATE TRIGGER set_chat_not_new_on_message
                AFTER INSERT ON messages
                BEGIN
                    UPDATE chats SET is_new_chat = 0
                    WHERE id = NEW.chat_id;
                END;
                
                -- Create index for faster querying of new chats
                CREATE INDEX IF NOT EXISTS idx_chats_is_new_chat ON chats(is_new_chat);
                
                -- Enforce that there is only one new chat for each type
                CREATE UNIQUE INDEX one_new_chat ON chats(is_new_chat, quick_chat) WHERE is_new_chat = 1 AND quick_chat = 0;
                CREATE UNIQUE INDEX one_new_quick_chat ON chats(is_new_chat, quick_chat) WHERE is_new_chat = 1 AND quick_chat = 1;
                
                -- Delete old "empty" chats with no messages 
                DELETE FROM chats WHERE id NOT IN (SELECT DISTINCT chat_id FROM messages);
            "#,
        },
        Migration {
            version: 104,
            description: "delete update_chats and ensure update_chats_timestamp_on_message trigger is working",
            kind: MigrationKind::Up,
            sql: r#"
                -- Drop this trigger as it's no longer needed (we don't want pins/renames to trigger updated_at refreshes)
                DROP TRIGGER IF EXISTS update_chats_timestamp;

                -- Recreate the update_chats_timestamp_on_message trigger
                -- This got erased by the messages table rename in Migration 17 
                -- Drop the trigger first if it exists to ensure clean recreation
                DROP TRIGGER IF EXISTS update_chats_timestamp_on_message;

                CREATE TRIGGER update_chats_timestamp_on_message 
                AFTER INSERT ON messages
                BEGIN
                    UPDATE chats SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.chat_id;
                END;
            "#,
        },
        Migration {
            version: 105,
            description: "add parent_chat_id column to chats table",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add parent_chat_id column to chats table
                ALTER TABLE chats ADD COLUMN parent_chat_id TEXT REFERENCES chats(id) ON DELETE SET NULL;
            "#,
        },
        Migration {
            version: 106,
            description: "add claude 4 opus and sonnet",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('anthropic::claude-opus-4-latest', 'Claude Opus 4', 1, '["text", "image", "webpage", "pdf"]'),
                    ('anthropic::claude-sonnet-4-latest', 'Claude Sonnet 4', 1, '["text", "image", "webpage", "pdf"]');

                --- add claude 4 opus and sonnet model configs to model_configs table
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'anthropic::claude-opus-4-latest', 'anthropic::claude-opus-4-latest', 'Claude Opus 4', '', 0),
                    ('system', 'anthropic::claude-sonnet-4-latest', 'anthropic::claude-sonnet-4-latest', 'Claude Sonnet 4', '', 0);
            "#,
        },
        Migration {
            version: 107,
            description: "make unique new chat indexes work with projects",
            kind: MigrationKind::Up,
            sql: r#"
                DROP INDEX IF EXISTS one_new_chat;
                DROP INDEX IF EXISTS one_new_quick_chat;
            "#,
        },
        Migration {
            version: 108,
            description: "add is_collapsed column to projects table",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add is_collapsed column to projects table with default value of 0 (not collapsed)
                ALTER TABLE projects ADD COLUMN is_collapsed BOOLEAN NOT NULL DEFAULT 0;
            "#,
        },
        Migration {
            version: 109,
            description: "add context_text column to projects table",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add context_text column to projects table
                ALTER TABLE projects ADD COLUMN context_text TEXT;
            "#,
        },
        Migration {
            version: 110,
            description: "add attachments table",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add attachments table
                CREATE TABLE attachments (
                    id TEXT PRIMARY KEY,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    type TEXT NOT NULL,
                    is_loading BOOLEAN NOT NULL DEFAULT 0,
                    original_name TEXT,
                    path TEXT NOT NULL,
                    ephemeral BOOLEAN NOT NULL DEFAULT 0
                );

                CREATE TABLE message_attachments (
                    message_id TEXT NOT NULL,
                    attachment_id TEXT NOT NULL,
                    PRIMARY KEY (message_id, attachment_id) -- Prevents associating the same attachment multiple times to the same message
                );

                CREATE TABLE project_attachments (
                    project_id TEXT NOT NULL,
                    attachment_id TEXT NOT NULL,
                    PRIMARY KEY (project_id, attachment_id)
                );

                CREATE TABLE draft_attachments (
                    chat_id TEXT NOT NULL,
                    attachment_id TEXT NOT NULL,
                    PRIMARY KEY (chat_id, attachment_id)
                );
            "#,
        },
        Migration {
            version: 111,
            description: "migrate old message attachments from JSON column to attachments table",
            kind: MigrationKind::Up,
            sql: r#"
                -- Step 1: Insert unique attachments into the 'attachments' table
                INSERT INTO attachments (id, type, original_name, path, ephemeral, is_loading, created_at)
                SELECT
                    hex(randomblob(16)) as id,
                    json_extract(value, '$.type') as type,
                    json_extract(value, '$.originalName') as original_name,
                    json_extract(value, '$.path') as path,
                    COALESCE(json_extract(value, '$.ephemeral'), 0) as ephemeral,
                    COALESCE(json_extract(value, '$.isLoading'), 0) AS is_loading,
                    CURRENT_TIMESTAMP as created_at
                FROM (
                    SELECT DISTINCT
                        json_extract(value, '$.path') as path_key, -- Key for distinctness
                        value -- The full JSON object for the attachment
                    FROM
                        messages m,
                        json_each(m.attachments)
                    WHERE
                        m.attachments IS NOT NULL AND json_valid(m.attachments) AND
                        json_extract(value, '$.path') IS NOT NULL AND json_extract(value, '$.path') != '' AND -- Ensure path exists and is not empty
                        json_extract(value, '$.type') IS NOT NULL -- Ensure type exists
                );

                -- Step 2: Populate the 'message_attachments' join table
                INSERT INTO message_attachments (message_id, attachment_id)
                SELECT DISTINCT
                    m.id as message_id,
                    a.id as attachment_id
                FROM
                    messages m,
                    json_each(m.attachments) je
                JOIN
                    attachments a ON json_extract(je.value, '$.path') = a.path -- Join on the path
                WHERE
                    m.attachments IS NOT NULL AND json_valid(m.attachments) AND
                    json_extract(je.value, '$.path') IS NOT NULL AND json_extract(je.value, '$.path') != '' AND -- Ensure path matches for join
                    json_extract(je.value, '$.type') IS NOT NULL; -- Ensure type exists for consistency with Step 1

                -- Step 3: Archive and NULL out the old attachments JSON column in the messages table
                ALTER TABLE messages ADD COLUMN dep_attachments_archive TEXT;
                UPDATE messages SET dep_attachments_archive = attachments WHERE attachments IS NOT NULL;
                ALTER TABLE messages DROP COLUMN attachments;
            "#,
        },
        Migration {
            version: 112,
            description: "add project_context_summary and related columns to chats table",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE chats ADD COLUMN project_context_summary TEXT;
                ALTER TABLE chats ADD COLUMN project_context_summary_is_stale BOOLEAN NOT NULL DEFAULT 1;
            "#,
        },
        Migration {
            version: 113,
            description: "add magic_projects_enabled column to projects table",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE projects ADD COLUMN magic_projects_enabled BOOLEAN NOT NULL DEFAULT 1;
            "#,
        },
        Migration {
            version: 114,
            description: "update default model from Claude 3.7 Sonnet to Claude Sonnet 4",
            kind: MigrationKind::Up,
            sql: r#"
                -- Update selected_model_configs_compare to use Claude Sonnet 4 instead of Claude 3.7 if user has the default value
                UPDATE app_metadata
                SET value = replace(value, '2b1c042c-82f8-4913-9cee-03ed71361f03', 'anthropic::claude-sonnet-4-latest')
                WHERE key = 'selected_model_configs_compare'
                AND json_extract(value, '$') LIKE '%2b1c042c-82f8-4913-9cee-03ed71361f03%';
            "#,
        },
        Migration {
            version: 115,
            description: "add openrouter deepseek-r1-0528 model",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add DeepSeek R1 0528 model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openrouter::deepseek/deepseek-r1-0528', 'DeepSeek R1 0528', 1, '["text", "webpage", "image"]');

                -- Add default model config for DeepSeek R1 0528
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'openrouter::deepseek/deepseek-r1-0528', 'openrouter::deepseek/deepseek-r1-0528', 'DeepSeek R1 0528', '', 0);
            "#,
        },
        Migration {
            version: 116,
            description: "enable web toolset by default if no record exists",
            kind: MigrationKind::Up,
            sql: r#"
                INSERT OR IGNORE INTO toolsets_config (toolset_name, parameter_id, parameter_value) VALUES
                    ('web', 'enabled', 'true');
            "#,
        },
        Migration {
            version: 117,
            description: "update Gemini 2.5 Flash (Preview) name to remove Preview label",
            kind: MigrationKind::Up,
            sql: r#"
                -- Update the display name in models table
                UPDATE models
                SET display_name = 'Gemini 2.5 Flash'
                WHERE id = 'google::gemini-2.5-flash-preview-04-17';

                -- Update the display name in model_configs table
                UPDATE model_configs
                SET display_name = 'Gemini 2.5 Flash'
                WHERE id = 'google::gemini-2.5-flash-preview-04-17';
            "#,
        },
        Migration {
            version: 118,
            description: "add new_until column to model_configs table",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE model_configs ADD COLUMN new_until DATETIME;
                
                -- Set new_until for deepseek r1 0528 to June 10
                UPDATE model_configs
                SET new_until = '2025-06-10 00:00:00'
                WHERE id = 'openrouter::deepseek/deepseek-r1-0528';
            "#,
        },
        Migration {
            version: 119,
            description: "set new_until for gemini 2.5 pro latest",
            kind: MigrationKind::Up,
            sql: r#"
                -- Set new_until for Gemini 2.5 Pro Latest to June 12
                UPDATE model_configs
                SET new_until = '2025-06-12 00:00:00'
                WHERE id = 'google::gemini-2.5-pro-latest';
            "#,
        },
        Migration {
            version: 120,
            description: "add o3-pro model",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add o3-pro model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::o3-pro', 'o3-pro', 1, '["text", "image", "webpage", "pdf"]');

                -- Add default model config for o3-pro
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'openai::o3-pro', 'openai::o3-pro', 'o3-pro', '', 0);

                -- Set new_until for o3-pro to June 20
                UPDATE model_configs
                SET new_until = '2025-06-20 00:00:00'
                WHERE id = 'openai::o3-pro';
            "#,
        },
        Migration {
            version: 121,
            description: "add is_imported column to projects table",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add is_imported column to projects table with default value of 0 (not imported)
                ALTER TABLE projects ADD COLUMN is_imported BOOLEAN NOT NULL DEFAULT 0;
            "#,
        },
        Migration {
            version: 122,
            description: "migrations for adding message reply support",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add reply_to_id column to chats table to store the ID of the message being replied to
                ALTER TABLE chats ADD COLUMN reply_to_id TEXT;

                -- Add reply_chat_id column to messages table to store the ID of the chat that is a reply to this message
                ALTER TABLE messages ADD COLUMN reply_chat_id TEXT;

                CREATE TABLE IF NOT EXISTS saved_model_configs_chats (
                    id TEXT NOT NULL PRIMARY KEY,
                    chat_id TEXT,
                    model_ids TEXT NOT NULL, -- JSON array of model IDs
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                
                -- Create index on chat_id for faster lookups
                CREATE INDEX idx_saved_model_configs_chats_chat_id ON saved_model_configs_chats(chat_id);
            "#,
        },
        Migration {
            version: 123,
            description: "migration for detecting which message a branch occurred from",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE messages ADD COLUMN branched_from_id TEXT;
            "#
        },
        Migration {
            version: 124,
            description: "create group chat prototype tables and columns",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add gc_prototype_chat column to chats table with default value of 0 (not a group chat)
                ALTER TABLE chats ADD COLUMN gc_prototype_chat BOOLEAN NOT NULL DEFAULT 0;
                
                -- Create gc_prototype_messages table for group chat messages
                CREATE TABLE gc_prototype_messages (
                    chat_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    text TEXT NOT NULL,
                    model_config_id TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_deleted BOOLEAN NOT NULL DEFAULT 0,
                    thread_root_message_id TEXT,
                    promoted_from_message_id TEXT,
                    PRIMARY KEY (chat_id, id)
                );
                
                -- Create indexes for gc_prototype_messages
                CREATE INDEX idx_gc_prototype_messages_chat_created ON gc_prototype_messages(chat_id, created_at);
                CREATE INDEX idx_gc_prototype_messages_thread_root ON gc_prototype_messages(thread_root_message_id);
                CREATE INDEX idx_gc_prototype_messages_promoted_from ON gc_prototype_messages(promoted_from_message_id);
                
                -- Create gc_prototype_conductors table for group chat conductor feature
                CREATE TABLE gc_prototype_conductors (
                    chat_id TEXT NOT NULL,
                    scope_id TEXT, -- NULL for main chat, thread_root_message_id for threads
                    conductor_model_id TEXT NOT NULL,
                    turn_count INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (chat_id, scope_id)
                );
                
                -- Create index for efficient lookups of active conductors
                CREATE INDEX idx_gc_prototype_conductors_active ON gc_prototype_conductors(chat_id, is_active);
            "#,
        },
        Migration {
            version: 125,
            description: "add o3-deep-research model",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add o3-deep-research model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::o3-deep-research', 'o3 Deep Research', 1, '["text", "image", "webpage", "pdf"]');

                -- Add default model config for o3-deep-research
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'openai::o3-deep-research', 'openai::o3-deep-research', 'o3 Deep Research', '', 0);
            "#,
        },
        Migration {
            version: 126,
            description: "add tool permissions table",
            kind: MigrationKind::Up,
            sql: r#"
                CREATE TABLE tool_permissions (
                    toolset_name TEXT NOT NULL,
                    tool_name TEXT NOT NULL,
                    permission_type TEXT NOT NULL CHECK (permission_type IN ('always_allow', 'always_deny', 'ask')),
                    last_asked_at DATETIME,
                    last_response TEXT CHECK (last_response IN ('allow', 'deny') OR last_response IS NULL),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (toolset_name, tool_name)
                );

                -- Add default permission settings to custom_toolsets
                ALTER TABLE custom_toolsets ADD COLUMN default_permission TEXT NOT NULL DEFAULT 'ask' 
                    CHECK (default_permission IN ('always_allow', 'always_deny', 'ask'));
            "#,
        },
        Migration {
            version: 127,
            description: "add yolo mode default setting",
            kind: MigrationKind::Up,
            sql: r#"
                -- Set YOLO mode to true by default
                INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('yolo_mode', 'true');
            "#,
        },
        Migration {
            version: 128,
            description: "add openrouter x-ai/grok-4 model",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Grok 4 model from OpenRouter
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openrouter::x-ai/grok-4', 'Grok 4', 1, '["text", "webpage", "image"]');

                -- Add default config for Grok 4
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default, new_until) VALUES
                    ('system', 'openrouter::x-ai/grok-4', 'openrouter::x-ai/grok-4', 'Grok 4', '', 0, '2025-07-17 00:00:00');
            "#,
        },
        Migration {
            version: 129,
            description: "add claude opus 4.1 and gpt-5 models",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Claude Opus 4.1 model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('anthropic::claude-opus-4.1-latest', 'Claude Opus 4.1', 1, '["text", "image", "webpage", "pdf"]');

                -- Add Claude Opus 4.1 model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default, new_until) VALUES
                    ('system', 'anthropic::claude-opus-4.1-latest', 'anthropic::claude-opus-4.1-latest', 'Claude Opus 4.1', '', 0, '2025-08-21 00:00:00');

                -- Add GPT-5 models
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openai::gpt-5', 'GPT-5', 1, '["text", "image", "webpage", "pdf"]'),
                    ('openai::gpt-5-mini', 'GPT-5 Mini', 1, '["text", "image", "webpage", "pdf"]'),
                    ('openai::gpt-5-nano', 'GPT-5 Nano', 1, '["text", "image", "webpage", "pdf"]');

                -- Add GPT-5 model configs
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default, new_until) VALUES
                    ('system', 'openai::gpt-5', 'openai::gpt-5', 'GPT-5', '', 0, '2025-08-21 00:00:00'),
                    ('system', 'openai::gpt-5-mini', 'openai::gpt-5-mini', 'GPT-5 Mini', '', 0, '2025-08-21 00:00:00'),
                    ('system', 'openai::gpt-5-nano', 'openai::gpt-5-nano', 'GPT-5 Nano', '', 0, '2025-08-21 00:00:00');
            "#,
        },
        Migration {
            version: 130,
            description: "add claude sonnet 4.5",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Claude Sonnet 4.5 model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('anthropic::claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 1, '["text", "image", "webpage", "pdf"]');

                -- Add Claude Sonnet 4.5 model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default, new_until) VALUES
                    ('system', 'anthropic::claude-sonnet-4-5-20250929', 'anthropic::claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', '', 0, '2025-10-15 00:00:00');
            "#,
        },
        Migration {
            version: 131,
            description: "add claude opus 4.5 via openrouter and set as default",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Claude Opus 4.5 model via OpenRouter
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('openrouter::anthropic/claude-opus-4.5', 'Claude Opus 4.5', 1, '["text", "image", "webpage", "pdf"]');

                -- Add Claude Opus 4.5 model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default, new_until) VALUES
                    ('system', 'openrouter::anthropic/claude-opus-4.5', 'openrouter::anthropic/claude-opus-4.5', 'Claude Opus 4.5', '', 0, '2025-10-15 00:00:00');

                -- Set Claude Opus 4.5 as the default chat model for new users
                -- selected_model_configs_compare is a JSON array used by the main chat
                INSERT OR REPLACE INTO app_metadata (key, value) VALUES
                    ('selected_model_configs_compare', '["openrouter::anthropic/claude-opus-4.5"]');
            "#,
        },
        Migration {
            version: 132,
            description: "disable claude 3.5 sonnet and add claude haiku 4.5 and opus 4.5",
            kind: MigrationKind::Up,
            sql: r#"
                -- Disable Claude 3.5 Sonnet
                UPDATE models
                SET is_enabled = 0
                WHERE id = 'anthropic::claude-3-5-sonnet-latest';

                -- Add Claude Haiku 4.5 model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('anthropic::claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 1, '["text", "image", "webpage", "pdf"]');

                -- Add Claude Haiku 4.5 model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default, new_until) VALUES
                    ('system', 'anthropic::claude-haiku-4-5-20251001', 'anthropic::claude-haiku-4-5-20251001', 'Claude Haiku 4.5', '', 0, '2025-10-15 00:00:00');

                -- Add Claude Opus 4.5 model via Anthropic (in addition to OpenRouter version)
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('anthropic::claude-opus-4-5-20251101', 'Claude Opus 4.5', 1, '["text", "image", "webpage", "pdf"]');

                -- Add Claude Opus 4.5 model config via Anthropic
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default, new_until) VALUES
                    ('system', 'anthropic::claude-opus-4-5-20251101', 'anthropic::claude-opus-4-5-20251101', 'Claude Opus 4.5', '', 0, '2025-10-15 00:00:00');
            "#,
        },
        Migration {
            version: 133,
            description: "add gemini-3-flash-preview and gemini-3-pro-preview models",
            kind: MigrationKind::Up,
            sql: r#"
                -- Add Gemini 3 Flash Preview model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-3-flash-preview', 'Gemini 3 Flash (Preview)', 1, '["text", "image", "webpage", "pdf"]');

                -- Add Gemini 3 Flash Preview model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'google::gemini-3-flash-preview', 'google::gemini-3-flash-preview', 'Gemini 3 Flash (Preview)', '', 0);

                -- Add Gemini 3 Pro Preview model
                INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types) VALUES
                    ('google::gemini-3-pro-preview', 'Gemini 3 Pro (Preview)', 1, '["text", "image", "webpage", "pdf"]');

                -- Add Gemini 3 Pro Preview model config
                INSERT OR REPLACE INTO model_configs (author, id, model_id, display_name, system_prompt, is_default) VALUES
                    ('system', 'google::gemini-3-pro-preview', 'google::gemini-3-pro-preview', 'Gemini 3 Pro (Preview)', '', 0);
            "#,
        },
        Migration {
            version: 134,
            description: "add pricing columns to models table",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE models ADD COLUMN prompt_price_per_token REAL;
                ALTER TABLE models ADD COLUMN completion_price_per_token REAL;
            "#,
        },
        Migration {
            version: 135,
            description: "add token usage and cost to messages table",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE messages ADD COLUMN prompt_tokens INTEGER;
                ALTER TABLE messages ADD COLUMN completion_tokens INTEGER;
                ALTER TABLE messages ADD COLUMN total_tokens INTEGER;
                ALTER TABLE messages ADD COLUMN cost_usd REAL;
            "#,
        },
        Migration {
            version: 136,
            description: "add total cost to chats table",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE chats ADD COLUMN total_cost_usd REAL DEFAULT 0.0;
                CREATE INDEX IF NOT EXISTS idx_messages_chat_cost ON messages(chat_id, cost_usd);
            "#,
        },
        Migration {
            version: 137,
            description: "add total cost to projects table",
            kind: MigrationKind::Up,
            sql: r#"
                ALTER TABLE projects ADD COLUMN total_cost_usd REAL DEFAULT 0.0;
                CREATE INDEX IF NOT EXISTS idx_chats_project_cost ON chats(project_id, total_cost_usd);
            "#,
        },
        Migration {
            version: 138,
            description: "set default cost values for existing rows",
            kind: MigrationKind::Up,
            sql: r#"
                UPDATE chats SET total_cost_usd = 0.0 WHERE total_cost_usd IS NULL;
                UPDATE projects SET total_cost_usd = 0.0 WHERE total_cost_usd IS NULL;
            "#,
        },
    ];
}
