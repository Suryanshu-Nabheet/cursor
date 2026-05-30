# Contributing to CodeX IDE

Thank you for choosing to contribute to **CodeX IDE**. We are committed to building a world-class, professional coding environment, and your expertise is invaluable.

---

## 💎 Excellence Standards

CodeX is a premium product. We maintain high standards for all contributions:

-   **Quality**: Code must be robust, type-safe, and well-architected.
-   **Aesthetics**: UI changes must align with our monochromatic, professional design system.
-   **Performance**: Every feature must be optimized for speed and resource efficiency.
-   **Privacy**: We prioritize offline functionality and data security.

---

## 🚀 Getting Started

1.  **Fork** the repository and create your feature branch.
2.  **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/CodeX.git`
3.  **Configure** upstream: `git remote add upstream https://github.com/Suryanshu-Nabheet/CodeX.git`
4.  **Install** dependencies: `npm install`
5.  **Initialize** build tools: `./scripts/setup.sh` (macOS/Linux), `.\scripts\setup.ps1` (Windows), or `npm run setup`

---

## 🛠️ Development Workflow

### Coding Standards

-   **TypeScript**: Mandatory for all logic. Follow strict typing patterns.
-   **Architecture**: Keep components focused. Business logic should reside in Redux slices or custom hooks.
-   **Linting**: Ensure all code passes `npm run lint`. Prefix intentionally unused variables with `_`.
-   **Styling**: Use CSS variables and maintain the professional monochromatic theme.

### Verification

Before submitting a Pull Request, ensure:

```bash
npm run format-check  # Verify code style
npm run lint          # Check for logic errors
npm test              # (If applicable) Run test suites
npm start             # Verify runtime stability
```

---

## 📤 Pull Request Process

1.  **Branch Naming**: Use descriptive names like `feat/advanced-fuzzy-search` or `fix/terminal-rendering`.
2.  **Conventional Commits**: We follow [Conventional Commits](https://www.conventionalcommits.org/):
    -   `feat:` for new capabilities.
    -   `fix:` for bug resolutions.
    -   `perf:` for performance enhancements.
    -   `refactor:` for code structural improvements.
3.  **Documentation**: Update `README.md` if your change impacts user behavior.
4.  **Changelog**: Add a concise entry to `CHANGELOG.md` under the `[Unreleased]` section.

---

## 🐛 Reporting Issues

Use our dedicated templates for professional reports:

-   **Bug Reports**: Include exact steps to reproduce, environment details, and screenshots.
-   **Feature Requests**: Provide a clear rationale on how the feature enhances the professional developer experience.

---

## 💬 Community & Support

-   **Discussions**: [GitHub Discussions](https://github.com/Suryanshu-Nabheet/CodeX/discussions)
-   **Email Support**: suryanshunab@gmail.com
-   **Lead Developer**: Suryanshu Nabheet

---

<p align="center">
  <b>Thank you for helping us define the future of coding.</b> 🎉
</p>
