flowchart TD
    %% ── 1. RECEPTION ───────────────────────────────────
    A[Poll for new user task<br/>(periodic or webhook)] -->|Task received| B[Classify & parse task]
    A -->|No task| A  %% idle wait loop

    %% ── 2. CLASSIFICATION ──────────────────────────────
    B --> C{Is task clear<br/>or needs clarification?}
    C -->|Unclear| C1[Ask user follow-up<br/>(blocking)]
    C1 --> B
    C -->|Clear| D[Determine domain<br/>(code / sysadmin / data etc.)]

    %% ── 3. PLANNING ────────────────────────────────────
    D --> E[Generate plan & sub-tasks<br/>(chain-of-thought+tool)]
    E --> F{Need elevated<br/>privileges?}
    F -->|Yes| F1[Request sudo token<br/>or abort]
    F1 --> G
    F -->|No| G

    %% ── 4. ENV PREP ───────────────────────────────────
    G[Prepare workspace<br/>(git init, deps, venv, apt)] --> H[Execute sub-task loop]

    %% ── 5. EXECUTION LOOP ─────────────────────────────
    H --> I{Run command; success?}
    I -->|Fail| I1[Capture error, self-repair<br/>(LLM explain & patch)]
    I1 --> H
    I -->|Success| I2[Validate output<br/>(tests, lint, static checks)]
    I2 --> J{Validation OK?}
    J -->|No| I1
    J -->|Yes & more steps| H
    J -->|Yes & last step| K[Aggregate results]

    %% ── 6. USER REVIEW ────────────────────────────────
    K --> L[Summarize progress & poll user]
    L --> M{User feedback}
    M -->|New requirements| B
    M -->|Approve| N[Package deliverables<br/>(tar, push, doc)]

    %% ── 7. CLEANUP & IDLE ─────────────────────────────
    N --> O[Cleanup temp files & logs]
    O --> A  %% back to idle wait


