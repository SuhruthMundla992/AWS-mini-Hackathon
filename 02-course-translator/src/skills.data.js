// Canonical skill taxonomy for Course Translator.
// Committed (not under data/) so it ships with the tool and isn't gitignored.
//
// Each entry:
//   id         kebab-case canonical id
//   name       human label
//   phrase     the recruiter-searchable wording we OUTPUT (employer language)
//   category   language | framework | database | cloud | infra | tool | concept | ml | hardware | theory | soft
//   aliases    strings to match in catalog text. Matching rules live in skills.js:
//                - tokens with letters only and length >= 3 match case-insensitively on word boundaries
//                - SHORT/AMBIGUOUS tokens listed in CASE_SENSITIVE match as exact-case standalone tokens
//                - symbol tokens (c++, c#) matched literally
//   roles      which target roles this skill is relevant to (for demand ranking + role filtering)
//
// Role keys: swe, ml, data, systems, frontend, embedded. "any" = relevant to all roles.

export const ROLES = {
  swe: 'Software Engineer',
  ml: 'ML / AI',
  data: 'Data / Analytics',
  systems: 'Systems / Backend',
  frontend: 'Frontend / Web',
  embedded: 'Embedded / Hardware',
};

// Short or English-word-colliding tokens that must match as an exact-case standalone token.
export const CASE_SENSITIVE = new Set(['C', 'R', 'Go', 'AI', 'ML', 'CV', 'NLP', 'OS', 'C++', 'C#', 'OOP', 'DP', 'CHI']);

export const SKILLS = [
  // ---- languages ----
  { id: 'python', name: 'Python', phrase: 'Python', category: 'language', aliases: ['python'], roles: ['swe', 'ml', 'data', 'systems'] },
  { id: 'c', name: 'C', phrase: 'C', category: 'language', aliases: ['C'], roles: ['systems', 'embedded'] },
  { id: 'cpp', name: 'C++', phrase: 'C++', category: 'language', aliases: ['c++', 'cpp'], roles: ['systems', 'embedded', 'swe'] },
  { id: 'java', name: 'Java', phrase: 'Java', category: 'language', aliases: ['java'], roles: ['swe', 'systems'] },
  { id: 'javascript', name: 'JavaScript', phrase: 'JavaScript', category: 'language', aliases: ['javascript', 'ecmascript'], roles: ['swe', 'frontend'] },
  { id: 'typescript', name: 'TypeScript', phrase: 'TypeScript', category: 'language', aliases: ['typescript'], roles: ['swe', 'frontend'] },
  { id: 'go', name: 'Go', phrase: 'Go', category: 'language', aliases: ['Go', 'golang'], roles: ['systems', 'swe'] },
  { id: 'rust', name: 'Rust', phrase: 'Rust', category: 'language', aliases: ['rust'], roles: ['systems', 'embedded'] },
  { id: 'sql', name: 'SQL', phrase: 'SQL', category: 'language', aliases: ['sql'], roles: ['data', 'swe', 'systems'] },
  { id: 'r-lang', name: 'R', phrase: 'R', category: 'language', aliases: ['R'], roles: ['data', 'ml'] },
  { id: 'matlab', name: 'MATLAB', phrase: 'MATLAB', category: 'language', aliases: ['matlab'], roles: ['ml', 'embedded', 'data'] },
  { id: 'assembly', name: 'Assembly', phrase: 'Assembly (x86/ARM)', category: 'language', aliases: ['assembly', 'assembler', 'x86', 'arm assembly'], roles: ['embedded', 'systems'] },
  { id: 'verilog', name: 'Verilog', phrase: 'Verilog / HDL', category: 'hardware', aliases: ['verilog', 'systemverilog', 'vhdl', 'hdl'], roles: ['embedded'] },
  { id: 'cuda', name: 'CUDA', phrase: 'CUDA / GPU programming', category: 'hardware', aliases: ['cuda', 'gpu programming'], roles: ['ml', 'systems', 'embedded'] },
  { id: 'bash', name: 'Shell scripting', phrase: 'Shell scripting (Bash)', category: 'tool', aliases: ['bash', 'shell scripting', 'unix shell'], roles: ['systems'] },

  // ---- CS theory / concepts (the heart of coursework translation) ----
  // 'abstract data type(s)' added so TAMU CSCE 221 ("basic abstract data types ... stacks, queues") maps to data-structures; it is a textbook synonym, not a broadening.
  { id: 'data-structures', name: 'Data structures', phrase: 'Data structures', category: 'theory', aliases: ['data structures', 'data structure', 'abstract data types', 'abstract data type'], roles: ['swe', 'systems', 'any'] },
  { id: 'algorithms', name: 'Algorithms', phrase: 'Algorithm design & analysis', category: 'theory', aliases: ['algorithms', 'algorithm design', 'algorithm analysis', 'analysis of algorithms'], roles: ['swe', 'systems', 'ml'] },
  { id: 'complexity', name: 'Complexity', phrase: 'Asymptotic & complexity analysis', category: 'theory', aliases: ['complexity', 'asymptotic', 'big-o', 'np-complete', 'computational complexity'], roles: ['swe', 'ml'] },
  // 'encapsulation' added: CSCE 120 says "encapsulation and abstraction" (OOP in other words).
  { id: 'oop', name: 'OOP', phrase: 'Object-oriented programming', category: 'concept', aliases: ['OOP', 'object-oriented', 'object oriented programming', 'encapsulation'], roles: ['swe'] },
  { id: 'functional-programming', name: 'Functional programming', phrase: 'Functional programming', category: 'concept', aliases: ['functional programming'], roles: ['swe'] },
  { id: 'design-patterns', name: 'Design patterns', phrase: 'Software design patterns', category: 'concept', aliases: ['design patterns', 'software design'], roles: ['swe'] },
  // 'software development' / 'software-engineering' added: CSCE 315 & 331 use these literal phrases.
  { id: 'software-engineering', name: 'Software engineering', phrase: 'Software engineering practices', category: 'concept', aliases: ['software engineering', 'software-engineering', 'software development', 'software development lifecycle', 'agile'], roles: ['swe'] },
  { id: 'operating-systems', name: 'Operating systems', phrase: 'Operating systems internals', category: 'concept', aliases: ['operating systems', 'operating system'], roles: ['systems', 'embedded'] },
  // 'system support' added for TAMU CSCE 313 ("system support for application programs ... system and network programming"), a systems-programming course whose catalog text never says the exact bigram "system programming".
  { id: 'systems-programming', name: 'Systems programming', phrase: 'Systems programming', category: 'concept', aliases: ['systems programming', 'system programming', 'system support'], roles: ['systems', 'embedded'] },
  // 'inter-process communication' (IPC, CSCE 313) and 'multi-threading' (hyphenated form in CSCE 463) added: both are core concurrency terms the base aliases missed.
  { id: 'concurrency', name: 'Concurrency', phrase: 'Concurrency & multithreading', category: 'concept', aliases: ['concurrency', 'concurrent', 'multithreading', 'multithreaded', 'multi-threading', 'threads', 'thread', 'synchronization', 'inter-process communication', 'parallel programming', 'parallel computing'], roles: ['systems', 'swe'] },
  // 'network programming' (CSCE 313) and 'network security' (CSCE 465) added: literal catalog phrases that denote computer-networking content the base aliases missed.
  { id: 'networking', name: 'Computer networks', phrase: 'Computer networking', category: 'concept', aliases: ['computer networks', 'networking', 'network programming', 'network security', 'network protocols', 'tcp/ip', 'tcp', 'sockets', 'socket programming'], roles: ['systems'] },
  { id: 'distributed-systems', name: 'Distributed systems', phrase: 'Distributed systems', category: 'concept', aliases: ['distributed systems', 'distributed computing'], roles: ['systems'] },
  { id: 'databases', name: 'Databases', phrase: 'Relational databases & SQL', category: 'concept', aliases: ['databases', 'database systems', 'relational database', 'dbms', 'query optimization'], roles: ['data', 'systems', 'swe'] },
  { id: 'compilers', name: 'Compilers', phrase: 'Compilers & language design', category: 'concept', aliases: ['compilers', 'compiler', 'programming languages', 'parsing', 'lexical analysis'], roles: ['systems'] },
  // 'computer architectures' (plural) / 'pipeline' added: CSCE 469 says "computer architectures ... pipeline techniques".
  { id: 'computer-architecture', name: 'Computer architecture', phrase: 'Computer architecture', category: 'concept', aliases: ['computer architecture', 'computer architectures', 'computer organization', 'microarchitecture', 'pipelining', 'pipeline', 'cache memory'], roles: ['embedded', 'systems'] },
  { id: 'digital-logic', name: 'Digital logic', phrase: 'Digital logic design', category: 'hardware', aliases: ['digital logic', 'digital design', 'logic design', 'combinational logic', 'sequential logic'], roles: ['embedded'] },
  { id: 'embedded-systems', name: 'Embedded systems', phrase: 'Embedded systems', category: 'hardware', aliases: ['embedded systems', 'embedded system', 'microcontrollers', 'microcontroller', 'firmware', 'real-time systems', 'rtos'], roles: ['embedded'] },
  { id: 'signal-processing', name: 'Signal processing', phrase: 'Digital signal processing', category: 'theory', aliases: ['signal processing', 'dsp', 'fourier', 'filtering'], roles: ['embedded', 'ml'] },
  // bare 'security' added so courses that only use the standalone word (CSCE 463 "...data-link switching; security; socket programming...") map to the security skill. \b boundaries mean it does NOT fire inside "cybersecurity".
  { id: 'security', name: 'Security', phrase: 'Computer security', category: 'concept', aliases: ['security', 'computer security', 'cybersecurity', 'cryptography', 'cryptographic', 'information security'], roles: ['systems', 'swe'] },
  { id: 'graphics', name: 'Computer graphics', phrase: 'Computer graphics', category: 'concept', aliases: ['computer graphics', 'rendering', 'opengl', 'rasterization'], roles: ['swe', 'ml'] },
  // 'chomsky' / 'abstract languages' / 'recursive function' added: CSCE 433 uses these instead of "automata".
  { id: 'theory-of-computation', name: 'Theory of computation', phrase: 'Theory of computation', category: 'theory', aliases: ['theory of computation', 'automata', 'formal languages', 'turing machines', 'computability', 'chomsky', 'abstract languages', 'recursive function'], roles: ['swe'] },

  // ---- math / theory ----
  { id: 'linear-algebra', name: 'Linear algebra', phrase: 'Linear algebra', category: 'theory', aliases: ['linear algebra', 'matrix algebra', 'matrices', 'eigenvalues'], roles: ['ml', 'data', 'embedded'] },
  { id: 'probability', name: 'Probability', phrase: 'Probability', category: 'theory', aliases: ['probability', 'probabilistic'], roles: ['ml', 'data'] },
  { id: 'statistics', name: 'Statistics', phrase: 'Applied statistics', category: 'theory', aliases: ['statistics', 'statistical', 'regression', 'hypothesis testing', 'statistical inference'], roles: ['data', 'ml'] },
  { id: 'discrete-math', name: 'Discrete math', phrase: 'Discrete mathematics', category: 'theory', aliases: ['discrete mathematics', 'discrete math', 'combinatorics', 'graph theory', 'set theory'], roles: ['swe'] },
  { id: 'calculus', name: 'Calculus', phrase: 'Calculus', category: 'theory', aliases: ['calculus', 'differential equations', 'multivariable calculus'], roles: ['ml', 'embedded'] },
  { id: 'optimization', name: 'Optimization', phrase: 'Numerical optimization', category: 'theory', aliases: ['optimization', 'numerical methods', 'convex optimization', 'numerical analysis'], roles: ['ml', 'data'] },

  // ---- ML / AI ----
  { id: 'machine-learning', name: 'Machine learning', phrase: 'Machine learning', category: 'ml', aliases: ['machine learning', 'supervised learning', 'unsupervised learning'], roles: ['ml', 'data'] },
  { id: 'deep-learning', name: 'Deep learning', phrase: 'Deep learning', category: 'ml', aliases: ['deep learning', 'neural networks', 'neural network', 'convolutional', 'cnn', 'rnn', 'transformers'], roles: ['ml'] },
  // 'intelligent systems/agents' and 'expert systems' added for classical-AI course CSCE 420, whose catalog text uses these terms but never the exact bigram "artificial intelligence".
  { id: 'artificial-intelligence', name: 'Artificial intelligence', phrase: 'Artificial intelligence', category: 'ml', aliases: ['artificial intelligence', 'AI', 'intelligent systems', 'intelligent agents', 'expert systems', 'search algorithms', 'knowledge representation'], roles: ['ml'] },
  { id: 'computer-vision', name: 'Computer vision', phrase: 'Computer vision', category: 'ml', aliases: ['computer vision', 'CV', 'image processing', 'object detection'], roles: ['ml'] },
  { id: 'nlp', name: 'NLP', phrase: 'Natural language processing', category: 'ml', aliases: ['natural language processing', 'NLP', 'language models'], roles: ['ml'] },
  { id: 'reinforcement-learning', name: 'Reinforcement learning', phrase: 'Reinforcement learning', category: 'ml', aliases: ['reinforcement learning'], roles: ['ml'] },
  { id: 'data-mining', name: 'Data mining', phrase: 'Data mining', category: 'ml', aliases: ['data mining', 'knowledge discovery'], roles: ['data', 'ml'] },
  { id: 'data-analysis', name: 'Data analysis', phrase: 'Data analysis & visualization', category: 'data', aliases: ['data analysis', 'data visualization', 'exploratory data analysis'], roles: ['data'] },
  { id: 'big-data', name: 'Big data', phrase: 'Big data processing', category: 'data', aliases: ['big data', 'mapreduce', 'hadoop', 'data warehousing'], roles: ['data', 'systems'] },

  // ---- frameworks / libraries ----
  { id: 'react', name: 'React', phrase: 'React', category: 'framework', aliases: ['react', 'react.js', 'reactjs'], roles: ['frontend', 'swe'] },
  { id: 'node', name: 'Node.js', phrase: 'Node.js', category: 'framework', aliases: ['node.js', 'nodejs', 'node js'], roles: ['swe', 'frontend'] },
  { id: 'web-development', name: 'Web development', phrase: 'Full-stack web development', category: 'framework', aliases: ['web development', 'web programming', 'web applications', 'html', 'css', 'rest api', 'restful'], roles: ['frontend', 'swe'] },
  { id: 'pytorch', name: 'PyTorch', phrase: 'PyTorch', category: 'framework', aliases: ['pytorch'], roles: ['ml'] },
  { id: 'tensorflow', name: 'TensorFlow', phrase: 'TensorFlow', category: 'framework', aliases: ['tensorflow'], roles: ['ml'] },
  { id: 'numpy', name: 'NumPy', phrase: 'NumPy / Pandas', category: 'framework', aliases: ['numpy', 'pandas', 'scipy', 'scikit-learn', 'sklearn'], roles: ['ml', 'data'] },

  // ---- infra / tools ----
  { id: 'git', name: 'Git', phrase: 'Git & version control', category: 'tool', aliases: ['git', 'version control'], roles: ['swe', 'systems'] },
  { id: 'docker', name: 'Docker', phrase: 'Docker', category: 'infra', aliases: ['docker', 'containers', 'containerization'], roles: ['systems'] },
  { id: 'kubernetes', name: 'Kubernetes', phrase: 'Kubernetes', category: 'infra', aliases: ['kubernetes', 'k8s'], roles: ['systems'] },
  { id: 'linux', name: 'Linux', phrase: 'Linux / Unix', category: 'tool', aliases: ['linux', 'unix', 'posix'], roles: ['systems', 'embedded'] },
  { id: 'cloud', name: 'Cloud', phrase: 'Cloud computing', category: 'cloud', aliases: ['cloud computing', 'aws', 'azure', 'distributed cloud'], roles: ['systems'] },
  { id: 'testing', name: 'Testing', phrase: 'Software testing', category: 'concept', aliases: ['software testing', 'unit testing', 'test-driven'], roles: ['swe'] },

  // ---- soft / domain ----
  // 'computer-human interaction' / 'CHI' / 'interface design' added: CSCE 436 uses "Computer-Human Interaction (CHI)".
  { id: 'hci', name: 'Human-computer interaction', phrase: 'Human-computer interaction (HCI)', category: 'concept', aliases: ['human-computer interaction', 'hci', 'computer-human interaction', 'CHI', 'user interface design', 'interface design', 'ux'], roles: ['frontend'] },
  { id: 'robotics', name: 'Robotics', phrase: 'Robotics', category: 'hardware', aliases: ['robotics', 'control systems', 'kinematics'], roles: ['embedded', 'ml'] },
];

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
