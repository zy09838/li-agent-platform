# 音频模型推理修复 - 快速指南

## 问题
模型部署后，听觉大师无法推理预测，显示"检测失败"

## 原因
1. 原推理服务端口(5003)被Docker占用
2. 推理服务未启动

## 解决方案

### 新架构
```
前端 → train_server(5001) → audio_inference_server(5005) → 返回结果
```

### 启动服务

```bash
cd /home/dell/桌面/智能体协作平台_0101/training

# 一键启动
./start_audio_services.sh

# 或手动启动
python3 audio_inference_server.py --port 5005 &
python3 train_server.py --port 5001 &
```

### 检查服务状态

```bash
# 查看进程
ps aux | grep -E "audio_inference|train_server" | grep python3

# 测试健康检查
curl http://localhost:5005/health

# 测试检测功能
curl -X POST http://localhost:5001/api/audio/detect \
  -F "audio=@test.wav" \
  -F "model_id=test"
```

## 测试结果

✅ **服务运行正常**
- audio_inference_server.py (端口 5005)
- train_server.py (端口 5001)

✅ **检测功能正常**
- 风扇.wav: 异常 (得分: 0.192, 严重异常)
- 滑轨2.wav: 异常 (得分: 0.207, 严重异常)

## 修改的文件

1. **新增**: `training/audio_inference_server.py` - 音频推理服务
2. **新增**: `training/start_audio_services.sh` - 启动脚本
3. **修改**: `training/train_server.py` - 添加代理端点
4. **修改**: `components/agents/AudioAgent.tsx` - 修改API地址

## 详细文档

- 完整修复过程: `AUDIO_INFERENCE_FIX.md`
- 测试报告: `training/test_report.txt`

---

**现在音频模型可以正常推理预测了！** 🎉
