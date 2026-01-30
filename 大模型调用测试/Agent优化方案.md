# 汽车外饰件视觉质检Agent优化方案

## 📊 当前问题分析

基于21张测试图片的准召率分析结果，发现以下关键问题：

### 1. 整体性能问题
- **准确率过低**: 18.97%（误报严重）
- **召回率中等**: 44.00%（漏检较多）
- **F1分数**: 26.51%（整体效果不理想）

### 2. 具体缺陷识别问题

| 问题类别 | 具体表现 | 影响 |
|---------|---------|------|
| **完全漏检** | 贴纸(8个全漏)、抛光印、磕伤、顶包 | 关键缺陷无法识别 |
| **高误报** | 橘皮(15次)、凹陷(6次)、流挂(2次) | 将正常特征误判为缺陷 |
| **识别混淆** | 将顶包误判为缩孔/凹陷 | 缺陷类型定义不清 |
| **表现良好** | 划伤(60%准确率、100%召回率) | 可作为优化参考 |

### 3. 当前工作流架构问题
- **单节点架构**: Start → LLM → Answer
- **无验证机制**: 直接输出结果，无二次校验
- **无知识增强**: 完全依赖大模型泛化能力
- **无分类预处理**: 所有缺陷类型混合检测
- **无置信度评估**: 无法判断检测结果可靠性

---

## 🎯 优化方案总体架构

### 优化后的工作流设计（7节点）

```
┌─────────┐
│  Start  │ 输入：图片 + 产品信息
└────┬────┘
     │
     ▼
┌─────────────────┐
│ 1. 图像预处理   │ 质量检查 + 特征增强
│   (Code节点)    │
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│ 2. 缺陷分类器   │ 初步分类：表面类/结构类/涂装类
│   (LLM节点)     │
└────┬────────────┘
     │
     ├─────────────┬─────────────┐
     ▼             ▼             ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│3.表面   │  │4.结构   │  │5.涂装   │ 专项检测（并行）
│  检测   │  │  检测   │  │  检测   │
│ (LLM)   │  │ (LLM)   │  │ (LLM)   │
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     └────────────┴────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ 6. 结果聚合    │ 合并 + 去重 + 冲突解决
         │   (Code节点)   │
         └────┬───────────┘
              │
              ▼
         ┌────────────────┐
         │ 7. 质量审核    │ 置信度评估 + 二次校验
         │   (LLM节点)    │
         └────┬───────────┘
              │
              ▼
         ┌─────────┐
         │ Answer  │ 最终报告输出
         └─────────┘
```

---

## 📋 详细优化方案

### 节点1: 图像预处理（Code节点）

**功能**：
- 图像质量检查（分辨率、光照、清晰度）
- 图像增强（对比度调整、降噪）
- 提取图像元数据（尺寸、格式、拍摄参数）
- 初步过滤低质量图片

**实现代码示例**：
```python
def image_preprocessing(image_path):
    """图像预处理节点"""
    import cv2
    import numpy as np
    from PIL import Image

    # 读取图像
    img = cv2.imread(image_path)
    pil_img = Image.open(image_path)

    # 1. 质量检查
    height, width = img.shape[:2]
    quality_score = 0
    quality_issues = []

    # 分辨率检查
    if width < 800 or height < 800:
        quality_issues.append("分辨率过低，建议至少800x800")
        quality_score += 1

    # 清晰度检查（拉普拉斯方差）
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    if laplacian_var < 100:
        quality_issues.append("图像模糊，清晰度不足")
        quality_score += 2

    # 亮度检查
    brightness = np.mean(gray)
    if brightness < 50:
        quality_issues.append("图像过暗")
        quality_score += 1
    elif brightness > 200:
        quality_issues.append("图像过亮")
        quality_score += 1

    # 2. 图像增强（如果需要）
    enhanced_img = img.copy()
    if brightness < 80 or brightness > 180:
        # 自适应直方图均衡化
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        l = clahe.apply(l)
        enhanced_img = cv2.merge([l, a, b])
        enhanced_img = cv2.cvtColor(enhanced_img, cv2.COLOR_LAB2BGR)

    # 3. 提取元数据
    metadata = {
        "width": width,
        "height": height,
        "format": pil_img.format,
        "mode": pil_img.mode,
        "quality_score": quality_score,
        "quality_issues": quality_issues,
        "brightness": float(brightness),
        "sharpness": float(laplacian_var)
    }

    return {
        "quality_pass": quality_score <= 2,
        "metadata": metadata,
        "enhanced_image_path": image_path,  # 实际应保存增强后的图像
        "preprocessing_notes": "图像质量检查完成"
    }
```

**输出变量**：
- `quality_pass`: bool（是否通过质量检查）
- `metadata`: dict（图像元数据）
- `enhanced_image_path`: string（增强后的图像路径）
- `preprocessing_notes`: string（预处理说明）

---

### 节点2: 缺陷分类器（LLM节点）

**目的**：将缺陷初步分类，以便后续专项检测

**Prompt模板**：
```
# 角色
你是一位汽车外饰件缺陷分类专家。

# 任务
请对上传的图片进行初步分析，将可能存在的缺陷分类到以下三个类别：

1. **表面缺陷** (Surface Defects)
   - 贴纸、标签异常
   - 污渍、指纹
   - 表面污染物

2. **结构缺陷** (Structural Defects)
   - 划伤、划痕
   - 磕伤、凹痕
   - 裂纹、破损
   - 顶包、缩痕
   - 变形

3. **涂装缺陷** (Coating Defects)
   - 橘皮纹理
   - 流挂
   - 颗粒、尘点
   - 缩孔、针孔
   - 抛光印
   - 色差

# 图像信息
- 图像质量: {{#image_preprocessing.quality_pass#}}
- 分辨率: {{#image_preprocessing.metadata.width#}} x {{#image_preprocessing.metadata.height#}}
- 清晰度评分: {{#image_preprocessing.metadata.sharpness#}}

# 输出要求
请以JSON格式输出你的分析结果：
```json
{
  "primary_category": "表面缺陷 | 结构缺陷 | 涂装缺陷",
  "confidence": 0.0-1.0,
  "detected_categories": ["类别1", "类别2"],
  "visual_features": "简要描述图像中观察到的主要特征",
  "recommendation": "建议进行的专项检测类型"
}
```

# 注意事项
1. 一张图片可能包含多个类别的缺陷，请在detected_categories中列出所有可能的类别
2. primary_category是你认为最主要的缺陷类别
3. confidence表示你的分类置信度
4. 如果图像质量不佳（quality_pass=false），请在recommendation中说明
```

**输出变量**：
- `classification_result`: JSON（分类结果）

---

### 节点3-5: 专项检测节点（并行执行）

#### 节点3: 表面缺陷检测（LLM节点）

**触发条件**：分类结果包含"表面缺陷"

**Prompt模板**：
```
# 角色
你是贴纸、标签和表面污染物检测专家。

# 专项检测：表面缺陷

## 重点关注
1. **贴纸/标签异常**（当前完全漏检，需特别关注）
   - 贴纸缺失
   - 贴纸位置偏移
   - 贴纸破损、起泡
   - 贴纸印刷模糊

2. **表面污染**
   - 污渍、油渍
   - 指纹、手印
   - 灰尘积累
   - 水渍、水痕

## 检测标准
- 检查产品上是否应该有贴纸或标签（根据常见汽车零部件规范）
- 对于黑色或深色表面，贴纸尤其容易被忽视，请仔细观察
- 贴纸通常位于产品的特定位置（如边角、侧面、底部）

## 误报预防
**注意**：以下情况**不属于**表面缺陷，请勿误报：
- 正常的光泽反射（斑马纹检测下的条纹）
- 产品本身的纹理或设计图案
- 正常的接缝线或分模线

## 输出格式
```json
{
  "defects": [
    {
      "type": "贴纸",  // 使用标准术语
      "subtype": "贴纸缺失",
      "location": "产品右下角",
      "description": "应有产品标签的位置未发现贴纸",
      "severity": "严重",
      "confidence": 0.85,
      "evidence": "该位置通常应有生产标签或条形码"
    }
  ],
  "no_defect_reason": "未发现表面缺陷的原因说明（如果没有缺陷）"
}
```

## 输入信息
- 分类建议: {{#defect_classifier.classification_result.recommendation#}}
- 图像特征: {{#defect_classifier.classification_result.visual_features#}}
```

#### 节点4: 结构缺陷检测（LLM节点）

**触发条件**：分类结果包含"结构缺陷"

**Prompt模板**：
```
# 角色
你是机械结构和物理损伤检测专家。

# 专项检测：结构缺陷

## 重点关注
1. **划伤/划痕**（当前表现最好的类别，保持）
   - 线状划痕（浅层）
   - 深度划伤（可见底材）
   - 擦伤痕迹

2. **机械损伤**（当前完全漏检）
   - 磕伤：冲击导致的局部凹陷或材料缺失
   - 撞痕：较大面积的形变
   - 压痕：受压产生的凹坑

3. **材料缺陷**（易混淆，需明确定义）
   - **顶包**：注塑件内部气泡导致的表面凸起（向外鼓）
   - **缩痕**：材料收缩导致的表面凹陷（向内陷）
   - 裂纹：材料断裂形成的缝隙

## 关键识别要点

### 顶包 vs 缩孔的区别
- **顶包**：表面**凸起**，通常较大（>2mm），边缘圆滑
- **缩孔**：表面**凹陷**，通常较小（<1mm），像小坑

### 磕伤 vs 划伤的区别
- **磕伤**：不规则形状，边缘粗糙，可能有材料缺失
- **划伤**：线状，边缘整齐

## 误报预防
以下情况**不属于**结构缺陷：
- 正常的橘皮纹理（属于涂装缺陷）
- 产品设计的圆弧或曲面（非变形）
- 光线造成的阴影（非真实凹陷）

## 输出格式
```json
{
  "defects": [
    {
      "type": "划伤",  // 使用标准术语：划伤、磕伤、顶包、缩痕、裂纹
      "location": "左侧边缘，距离顶部约5cm",
      "description": "长约8mm的线性划伤，未露底材",
      "severity": "中等",
      "confidence": 0.90,
      "dimension": {
        "length_mm": 8,
        "width_mm": 0.2,
        "depth": "浅层"
      }
    }
  ],
  "no_defect_reason": ""
}
```

## 输入信息
- 分类建议: {{#defect_classifier.classification_result.recommendation#}}
```

#### 节点5: 涂装缺陷检测（LLM节点）

**触发条件**：分类结果包含"涂装缺陷"

**Prompt模板**：
```
# 角色
你是汽车涂装质量检测专家。

# 专项检测：涂装缺陷

## 重点关注
1. **颗粒/尘点**（当前召回率80%，但准确率低）
   - 异色颗粒：与基材颜色不同的杂质点
   - 同色颗粒：与基材颜色相同的凸起点

2. **涂层问题**
   - 缩孔/针孔：涂层中的小凹坑（圆形）
   - 抛光印：抛光不均留下的痕迹或色差（当前完全漏检）
   - 流挂：涂料流淌形成的垂直条纹

3. **表面质感问题**（高误报区域，需谨慎）
   - 橘皮：涂层表面的微小波纹纹理

## 关键判断标准

### 橘皮的正常范围
**重要**：轻微的橘皮纹理是汽车涂装的正常现象，**不应被判定为缺陷**，除非：
- 橘皮纹理明显不均匀（局部粗糙度差异大）
- 橘皮纹理特别严重（波纹高度>30μm，肉眼明显可见）
- 产品标注为A级表面且客户有特殊要求

### 颗粒的判定标准
- **异色颗粒**：直径≥0.3mm → NG
- **同色颗粒**：直径≥1.0mm → NG
- 金属漆的金属闪光点**不是缺陷**

### 抛光印的识别（当前漏检）
- 局部光泽度不一致
- 呈现云雾状或波浪状的色差
- 通常在曲面或边缘区域

## 误报预防
以下情况**不属于**涂装缺陷（当前误报最严重）：
- **正常橘皮纹理**：轻微且均匀的表面波纹（需评估是否在标准范围内）
- 设计纹理：产品本身的哑光或磨砂效果
- 光线反射：斑马纹灯光造成的条纹（这是检测方法，不是缺陷）

## 检测策略
1. 首先判断橘皮是否超出正常范围
2. 区分金属漆的闪光点和真正的颗粒缺陷
3. 只报告明确的、超出标准的缺陷

## 输出格式
```json
{
  "defects": [
    {
      "type": "颗粒",  // 使用标准术语：颗粒、缩孔、抛光印、流挂、橘皮
      "subtype": "异色颗粒",
      "location": "正面中央区域",
      "description": "白色异色颗粒，直径约0.5mm，凸起明显",
      "severity": "中等",
      "confidence": 0.75,
      "size_mm": 0.5,
      "count": 1
    }
  ],
  "surface_quality_note": "橘皮纹理评估：[正常范围内 | 略微超标 | 明显超标]",
  "no_defect_reason": ""
}
```

## 输入信息
- 分类建议: {{#defect_classifier.classification_result.recommendation#}}
- 图像亮度: {{#image_preprocessing.metadata.brightness#}}
```

---

### 节点6: 结果聚合（Code节点）

**功能**：
- 合并多个专项检测结果
- 去重（同一缺陷被多个节点检测到）
- 冲突解决（不同节点对同一位置有不同判断）
- 置信度加权

**实现逻辑**：
```python
def aggregate_results(surface_defects, structural_defects, coating_defects):
    """结果聚合节点"""
    import json
    from collections import defaultdict

    all_defects = []

    # 1. 收集所有检测结果
    for result_json in [surface_defects, structural_defects, coating_defects]:
        if not result_json or result_json.strip() == "":
            continue
        try:
            result = json.loads(result_json)
            defects = result.get("defects", [])
            for defect in defects:
                defect["source"] = "专项检测"
                all_defects.append(defect)
        except:
            continue

    # 2. 去重和合并
    # 按位置和类型分组
    grouped = defaultdict(list)
    for defect in all_defects:
        key = (defect.get("type", ""), defect.get("location", ""))
        grouped[key].append(defect)

    # 3. 对于重复检测，选择置信度最高的
    merged_defects = []
    for key, defect_list in grouped.items():
        if len(defect_list) == 1:
            merged_defects.append(defect_list[0])
        else:
            # 多个检测结果，选择置信度最高的
            best = max(defect_list, key=lambda x: x.get("confidence", 0))
            best["confirmed_by_multiple"] = True
            merged_defects.append(best)

    # 4. 按严重程度排序
    severity_order = {"严重": 0, "中等": 1, "轻微": 2}
    merged_defects.sort(key=lambda x: severity_order.get(x.get("severity", "轻微"), 3))

    # 5. 统计
    stats = {
        "total_defects": len(merged_defects),
        "severe": sum(1 for d in merged_defects if d.get("severity") == "严重"),
        "moderate": sum(1 for d in merged_defects if d.get("severity") == "中等"),
        "minor": sum(1 for d in merged_defects if d.get("severity") == "轻微"),
        "high_confidence": sum(1 for d in merged_defects if d.get("confidence", 0) >= 0.8)
    }

    return {
        "merged_defects": json.dumps(merged_defects, ensure_ascii=False),
        "stats": json.dumps(stats, ensure_ascii=False),
        "defect_count": len(merged_defects)
    }
```

**输出变量**：
- `merged_defects`: JSON（合并后的缺陷列表）
- `stats`: JSON（统计信息）
- `defect_count`: int（缺陷总数）

---

### 节点7: 质量审核（LLM节点）

**目的**：二次校验，过滤误报，提升准确率

**Prompt模板**：
```
# 角色
你是质量审核专家，负责对检测结果进行最终审核。

# 任务
对以下检测结果进行审核，重点关注：
1. 是否存在误报（将正常特征判定为缺陷）
2. 缺陷定义是否准确
3. 严重程度评估是否合理

# 检测结果
{{#result_aggregation.merged_defects#}}

# 统计信息
{{#result_aggregation.stats#}}

# 图像元数据
- 图像清晰度: {{#image_preprocessing.metadata.sharpness#}}
- 图像亮度: {{#image_preprocessing.metadata.brightness#}}

# 审核重点

## 高误报缺陷类型（需严格审核）
1. **橘皮**：如果检测到橘皮，请评估：
   - 是否为正常的涂装纹理？
   - 是否明显超出行业标准？
   - 建议：轻微橘皮应标注为"在正常范围内"而非缺陷

2. **凹陷**：如果检测到凹陷，请确认：
   - 是否为光线阴影导致的误判？
   - 是否为产品的正常曲面设计？

3. **流挂**：如果检测到流挂，请确认：
   - 是否为垂直方向的真实涂料堆积？
   - 是否只是光线反射造成的视觉效果？

## 易漏检缺陷类型（需复查）
1. **贴纸**：是否有贴纸缺失的情况被漏检？
2. **抛光印**：是否有局部光泽不均的情况？
3. **磕伤**：是否有不规则的表面损伤？

## 审核输出
请输出审核后的最终报告：

```json
{
  "final_defects": [
    {
      "type": "缺陷类型",
      "location": "位置",
      "description": "描述",
      "severity": "严重 | 中等 | 轻微",
      "confidence": 0.0-1.0,
      "review_note": "审核意见"
    }
  ],
  "removed_false_positives": [
    {
      "type": "被移除的缺陷类型",
      "reason": "移除原因（误报）"
    }
  ],
  "overall_verdict": "合格 | 不合格 | 待复检",
  "confidence_score": 0.0-1.0,
  "review_summary": "审核总结"
}
```

# 输出要求
1. 只保留确信的缺陷（confidence >= 0.7）
2. 对于低置信度的检测结果，移除或标注为"待复检"
3. 提供清晰的审核理由
```

**输出变量**：
- `final_report`: JSON（最终审核报告）

---

### 节点8: Answer（最终输出）

**格式化输出**：

```
# 汽车外饰件质检报告

## 综合判定
{{#quality_review.final_report.overall_verdict#}}

## 图像质量信息
- 分辨率: {{#image_preprocessing.metadata.width#}} x {{#image_preprocessing.metadata.height#}}
- 清晰度: {{#image_preprocessing.metadata.sharpness#}}
- 质量评估: {{#image_preprocessing.quality_pass#}}

## 检测统计
- 总检测缺陷数: {{#result_aggregation.defect_count#}}
- 审核后确认缺陷数: {{#quality_review.final_report.final_defects|length#}}
- 检测置信度: {{#quality_review.final_report.confidence_score#}}

## 缺陷详情
{{#quality_review.final_report.final_defects#}}

## 误报移除记录
{{#quality_review.final_report.removed_false_positives#}}

## 审核总结
{{#quality_review.final_report.review_summary#}}

---
*报告生成时间: {{#sys.timestamp#}}*
*检测模式: 多阶段专项检测 v2.0*
```

---

## 🔧 Prompt优化策略

### 1. 明确缺陷定义
在每个专项检测节点中，必须提供：
- **正面案例**：这是缺陷的典型特征
- **负面案例**：这些情况不是缺陷
- **边界案例**：需要根据严重程度判断

### 2. 引入Few-Shot示例

在LLM节点中添加示例：

```
## 检测示例

### 示例1：正确识别划伤
**图像特征**: 表面有一条5mm长的线性痕迹
**正确输出**:
```json
{"type": "划伤", "location": "...", "confidence": 0.90}
```

### 示例2：避免误报橘皮
**图像特征**: 表面有均匀的轻微波纹纹理
**正确输出**:
```json
{"defects": [], "no_defect_reason": "观察到轻微橘皮纹理，但在正常范围内，不构成缺陷"}
```
```

### 3. 置信度校准

要求每个检测必须给出置信度，并说明理由：

```
# 置信度评估指南
- 0.9-1.0: 非常明确的缺陷，特征典型
- 0.7-0.9: 明显的缺陷，符合标准定义
- 0.5-0.7: 疑似缺陷，建议人工复核
- 0.0-0.5: 不确定，可能是正常特征
```

---

## 📚 知识库增强方案

### 1. 添加知识库节点

**知识库内容**：
- 各类缺陷的标准照片（正常 vs 异常）
- 行业标准文档（如GB/T、ISO标准）
- 历史误判案例库
- 客户特定要求文档

**实现方式**：
- 使用Dify的Knowledge Base功能
- 在分类器和专项检测节点中启用检索增强（RAG）

**配置示例**：
```yaml
knowledge_base:
  - name: "缺陷标准图库"
    type: "image_examples"
    content: "各类缺陷的标准对比图"

  - name: "质检标准文档"
    type: "documents"
    content: "GB/T、ISO、客户标准"

  - name: "误判案例库"
    type: "cases"
    content: "历史误报案例及纠正说明"
```

### 2. 在Prompt中引用知识库

```
# 参考标准
{{#knowledge.defect_standards#}}

# 历史案例
请参考以下类似案例：
{{#knowledge.similar_cases#}}
```

---

## 🎨 条件分支优化

### 使用If-Else节点控制流程

**场景1：图像质量不合格直接返回**
```
IF {{#image_preprocessing.quality_pass#}} == false
  THEN → 直接返回"图像质量不合格，请重新拍摄"
  ELSE → 继续检测流程
```

**场景2：按分类结果选择性执行**
```
IF "表面缺陷" in {{#defect_classifier.detected_categories#}}
  THEN → 执行节点3（表面检测）
  ELSE → 跳过

IF "结构缺陷" in {{#defect_classifier.detected_categories#}}
  THEN → 执行节点4（结构检测）
  ELSE → 跳过

IF "涂装缺陷" in {{#defect_classifier.detected_categories#}}
  THEN → 执行节点5（涂装检测）
  ELSE → 跳过
```

**场景3：置信度过低触发人工审核**
```
IF {{#quality_review.confidence_score#}} < 0.7
  THEN → 输出"建议人工复核" + 发送通知
  ELSE → 直接输出结果
```

---

## 📊 效果预期

基于当前问题的针对性优化，预期提升效果：

| 指标 | 当前 | 预期 | 提升 |
|------|------|------|------|
| **准确率** | 18.97% | **60-70%** | +41-51% |
| **召回率** | 44.00% | **70-80%** | +26-36% |
| **F1分数** | 26.51% | **65-75%** | +38-48% |

### 分项改进预期

| 缺陷类型 | 当前F1 | 预期F1 | 改进措施 |
|---------|--------|--------|----------|
| 贴纸 | 0% | **70%+** | 专项检测 + 明确定义 |
| 划伤 | 75% | **80%+** | 保持当前策略 |
| 颗粒 | 33.3% | **60%+** | 误报过滤 + 明确标准 |
| 抛光印 | 0% | **50%+** | 专项检测 + 案例学习 |
| 橘皮误报 | 15次 | **<3次** | 二次审核 + 标准定义 |

---

## 🚀 实施路线图

### 第一阶段（1-2周）：基础架构升级
- [ ] 实现7节点工作流架构
- [ ] 添加图像预处理节点
- [ ] 实现结果聚合逻辑
- [ ] 测试基本流程

### 第二阶段（2-3周）：Prompt优化
- [ ] 为每个专项检测节点编写详细Prompt
- [ ] 添加Few-Shot示例
- [ ] 实现置信度评估机制
- [ ] 添加质量审核节点

### 第三阶段（3-4周）：知识库建设
- [ ] 收集各类缺陷标准图片
- [ ] 整理行业标准文档
- [ ] 建立历史案例库
- [ ] 配置RAG检索

### 第四阶段（4-5周）：效果验证与迭代
- [ ] 在完整测试集上重新测试
- [ ] 分析新的准召率结果
- [ ] 根据反馈调整Prompt和阈值
- [ ] 优化误报过滤规则

---

## 📝 配置文件模板

### 优化后的workflow配置示例

```yaml
workflow:
  graph:
    nodes:
      # 1. 开始节点
      - id: start
        type: start
        variables:
          - name: image
            type: file
            required: true

      # 2. 图像预处理
      - id: image_preprocessing
        type: code
        code: |
          # 图像质量检查和增强代码
          def main(image_path):
              return image_preprocessing(image_path)

      # 3. 缺陷分类器
      - id: defect_classifier
        type: llm
        model: gemini-3-pro-preview
        prompt: "分类器Prompt（见上文）"
        vision:
          enabled: true

      # 4. 条件分支：图像质量检查
      - id: quality_check
        type: if-else
        condition: "{{#image_preprocessing.quality_pass#}} == true"

      # 5. 表面缺陷检测
      - id: surface_detection
        type: llm
        model: gemini-3-pro-preview
        prompt: "表面检测Prompt（见上文）"
        condition: "'表面缺陷' in {{#defect_classifier.detected_categories#}}"

      # 6. 结构缺陷检测
      - id: structural_detection
        type: llm
        model: gemini-3-pro-preview
        prompt: "结构检测Prompt（见上文）"
        condition: "'结构缺陷' in {{#defect_classifier.detected_categories#}}"

      # 7. 涂装缺陷检测
      - id: coating_detection
        type: llm
        model: gemini-3-pro-preview
        prompt: "涂装检测Prompt（见上文）"
        condition: "'涂装缺陷' in {{#defect_classifier.detected_categories#}}"

      # 8. 结果聚合
      - id: result_aggregation
        type: code
        code: |
          def main(surface, structural, coating):
              return aggregate_results(surface, structural, coating)

      # 9. 质量审核
      - id: quality_review
        type: llm
        model: gemini-3-pro-preview
        prompt: "审核Prompt（见上文）"
        context:
          enabled: true
          variable_selector:
            - result_aggregation.merged_defects
            - result_aggregation.stats

      # 10. 最终输出
      - id: answer
        type: answer
        answer: "{{#quality_review.final_report#}}"

    edges:
      - source: start
        target: image_preprocessing
      - source: image_preprocessing
        target: quality_check
      - source: quality_check
        target: defect_classifier
        condition: true
      - source: defect_classifier
        target: surface_detection
      - source: defect_classifier
        target: structural_detection
      - source: defect_classifier
        target: coating_detection
      - source: surface_detection
        target: result_aggregation
      - source: structural_detection
        target: result_aggregation
      - source: coating_detection
        target: result_aggregation
      - source: result_aggregation
        target: quality_review
      - source: quality_review
        target: answer
```

---

## 🔍 监控和评估

### 关键指标监控

在生产环境中，建议添加以下监控：

```python
# 每次检测后记录
metrics = {
    "timestamp": datetime.now(),
    "image_quality_score": quality_score,
    "classification_confidence": classifier_confidence,
    "detected_defect_count": len(defects),
    "average_confidence": avg_confidence,
    "false_positive_removed": len(removed_fps),
    "processing_time_ms": processing_time,
    "workflow_version": "v2.0"
}
```

### A/B测试建议

1. **对照组**：使用当前单节点工作流
2. **实验组**：使用优化后的7节点工作流
3. **对比指标**：准确率、召回率、F1、处理时间、用户满意度

---

## 💡 额外优化建议

### 1. 引入人类反馈循环（RLHF）
- 对每次检测结果，允许用户标注"正确"/"误报"/"漏检"
- 将反馈数据加入知识库
- 定期更新Prompt和示例

### 2. 多模型投票机制
- 对于高价值产品，使用多个模型并行检测
- 通过投票机制提升可靠性
- 示例：同时使用GPT-4V、Gemini Pro、Claude 3

### 3. 细粒度缺陷分类
- 将当前10类缺陷扩展到20+子类
- 例如：划伤 → 浅层划伤/深层划伤/擦伤
- 提供更精准的质检报告

### 4. 添加测量节点
- 使用图像处理算法测量缺陷尺寸
- 提供定量数据（长度、宽度、面积）
- 与标准阈值对比

---

## 📞 实施支持

如需实施此优化方案，建议准备：

1. **测试数据集**：至少100张标注图片
2. **标准文档**：客户或行业质检标准
3. **计算资源**：支持并行LLM调用的API配额
4. **开发时间**：预计4-5周完整实施
5. **迭代周期**：每周进行一次准召率测试和调整

---

**文档版本**: v1.0
**创建日期**: 2025-12-30
**适用场景**: 汽车外饰件视觉质检AI Agent优化
