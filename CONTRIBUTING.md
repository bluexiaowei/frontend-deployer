# 贡献指南

感谢你对 Frontend Deployer 项目的关注！我们欢迎所有形式的贡献。

## 如何贡献

### 报告问题

如果你发现了 bug 或有功能建议，请：

1. 检查 [Issues](https://github.com/yourusername/frontend-deployer/issues) 中是否已有相关问题
2. 如果没有，请创建新的 Issue，并包含：
   - 清晰的问题描述
   - 复现步骤
   - 预期行为 vs 实际行为
   - 环境信息（操作系统、Docker 版本等）

### 提交代码

1. **Fork 项目**
   ```bash
   git clone https://github.com/yourusername/frontend-deployer.git
   cd frontend-deployer
   ```

2. **创建分支**
   ```bash
   git checkout -b feature/your-feature-name
   # 或
   git checkout -b fix/your-bug-fix
   ```

3. **进行修改**
   - 保持代码风格一致
   - 添加必要的注释
   - 确保代码可以正常运行

4. **提交更改**
   ```bash
   git add .
   git commit -m "描述你的更改"
   git push origin feature/your-feature-name
   ```

5. **创建 Pull Request**
   - 在 GitHub 上创建 Pull Request
   - 详细描述你的更改和原因
   - 等待代码审查

## 代码规范

- 使用有意义的变量和函数名
- 添加必要的注释，特别是复杂逻辑
- 保持代码简洁，避免过度设计
- 遵循现有的代码风格

## 开发环境设置

```bash
# 安装依赖
npm install

# 启动开发环境（需要 Docker）
docker compose up -d --build

# 查看日志
docker logs -f frontend-deployer
```

## 测试

在提交 PR 之前，请确保：

- [ ] 代码可以正常启动
- [ ] 可以成功部署一个测试项目
- [ ] 可以正常删除项目
- [ ] 没有引入新的错误或警告

## 问题分类

- `bug`: 修复 bug
- `feature`: 新功能
- `docs`: 文档改进
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建/工具相关

再次感谢你的贡献！🎉

