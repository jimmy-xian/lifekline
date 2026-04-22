import { UserInput, LifeDestinyResult, Gender, DebugInfo } from "../types";
import { BAZI_SYSTEM_INSTRUCTION } from "../constants";

// Helper to determine stem polarity (保留这个辅助函数，因为生成提示词还需要它)
const getStemPolarity = (pillar: string): 'YANG' | 'YIN' => {
  if (!pillar) return 'YANG'; // default
  const firstChar = pillar.trim().charAt(0);
  const yangStems = ['甲', '丙', '戊', '庚', '壬'];
  const yinStems = ['乙', '丁', '己', '辛', '癸'];
  
  if (yangStems.includes(firstChar)) return 'YANG';
  if (yinStems.includes(firstChar)) return 'YIN';
  return 'YANG'; // fallback
};

const sanitizeApiKey = (apiKey: string) => (apiKey ? `${apiKey.slice(0, 6)}***` : '');

const appendDebugSection = (base: string, title: string, content: string) => {
  const block = `===== ${title} =====\n${content}`;
  return base ? `${base}\n\n${block}` : block;
};

const extractAnalysis = (data: any) => ({
  bazi: data.bazi || [],
  summary: data.summary || "无摘要",
  summaryScore: data.summaryScore || 5,
  industry: data.industry || "无",
  industryScore: data.industryScore || 5,
  wealth: data.wealth || "无",
  wealthScore: data.wealthScore || 5,
  marriage: data.marriage || "无",
  marriageScore: data.marriageScore || 5,
  health: data.health || "无",
  healthScore: data.healthScore || 5,
  family: data.family || "无",
  familyScore: data.familyScore || 5,
});

const normalizeChartPoints = (chartPoints: any[], startAge: number, endAge: number) => {
  const filteredPoints = chartPoints.filter((point) => {
    const age = typeof point?.age === 'number' ? point.age : Number(point?.age);
    return Number.isFinite(age) && age >= startAge && age <= endAge;
  });

  const uniquePoints = new Map<number, any>();
  for (const point of filteredPoints) {
    const age = typeof point.age === 'number' ? point.age : Number(point.age);
    if (!uniquePoints.has(age)) {
      uniquePoints.set(age, { ...point, age });
    }
  }

  return Array.from(uniquePoints.values()).sort((a, b) => a.age - b.age);
};

const validateChartPoints = (
  chartPoints: any[],
  startAge: number,
  endAge: number,
  label: string,
  debugInfo: DebugInfo
) => {
  const normalizedChartPoints = normalizeChartPoints(chartPoints, startAge, endAge);
  if (normalizedChartPoints.length !== chartPoints.length) {
    appendDebugResponse(
      debugInfo,
      `分段归一化说明 ${label}`,
      `原始 ${chartPoints.length} 条，归一化后 ${normalizedChartPoints.length} 条；已按年龄范围过滤、去重并排序。`
    );
  }

  const expectedCount = endAge - startAge + 1;
  if (normalizedChartPoints.length !== expectedCount) {
    debugInfo.parseError = `${label} 数量不正确：期望 ${expectedCount} 条，原始 ${chartPoints.length} 条，归一化后 ${normalizedChartPoints.length} 条。`;
    const error = new Error(`${label} 推演不完整：期望 ${expectedCount} 年，归一化后实际 ${normalizedChartPoints.length} 年。`) as Error & { debugInfo?: DebugInfo };
    error.debugInfo = debugInfo;
    throw error;
  }

  const hasInvalidAgeSequence = normalizedChartPoints.some((point: any, index: number) => point?.age !== startAge + index);
  if (hasInvalidAgeSequence) {
    debugInfo.parseError = `${label} 的 age 序列不连续。`;
    const error = new Error(`${label} 年龄序列不连续，请重试。`) as Error & { debugInfo?: DebugInfo };
    error.debugInfo = debugInfo;
    throw error;
  }

  return normalizedChartPoints;
};

const parseJsonContent = (content: string) => {
  const cleanedContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
  return {
    cleanedContent,
    data: JSON.parse(cleanedContent),
  };
};

const buildMasterGuide = (analysis: ReturnType<typeof extractAnalysis>) => `
【总纲分析摘要】
- 八字四柱：${analysis.bazi.join(' / ') || '未提供'}
- 命理总评：${analysis.summary}
- 事业行业：${analysis.industry}
- 财富层级：${analysis.wealth}
- 婚姻情感：${analysis.marriage}
- 身体健康：${analysis.health}
- 六亲关系：${analysis.family}

【一致性要求】
- 后续所有流年分段推演，必须与以上总纲保持同一套格局、喜忌、用神、运势判断逻辑。
- 不允许后续分段与总纲在核心判断上自相矛盾。
`.trim();

const appendDebugRequest = (debugInfo: DebugInfo, title: string, requestBody: Record<string, unknown>, apiKey: string) => {
  debugInfo.requestPayload = appendDebugSection(
    debugInfo.requestPayload,
    title,
    JSON.stringify(
      { ...requestBody, apiKey: sanitizeApiKey(apiKey) },
      null,
      2
    )
  );
};

const appendDebugResponse = (debugInfo: DebugInfo, title: string, content: string) => {
  debugInfo.backendResponse = appendDebugSection(
    debugInfo.backendResponse || '',
    title,
    content
  );
};

const appendDebugModelText = (debugInfo: DebugInfo, title: string, rawContent: string, cleanedContent: string) => {
  debugInfo.modelRawContent = appendDebugSection(
    debugInfo.modelRawContent || '',
    `模型原始文本 ${title}`,
    rawContent
  );
  debugInfo.cleanedModelContent = appendDebugSection(
    debugInfo.cleanedModelContent || '',
    `清洗后的文本 ${title}`,
    cleanedContent
  );
};

const executeModelRequest = async (
  label: string,
  requestBody: Record<string, unknown>,
  requestStartedAt: number,
  debugInfo: DebugInfo
) => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  debugInfo.responseStatus = response.status;

  console.info('[LifeKLine] 收到模型响应', {
    label,
    status: response.status,
    elapsedMs: Date.now() - requestStartedAt,
  });

  if (!response.ok) {
    let errMessage = `请求失败: ${response.status}`;
    try {
      const errJson = await response.json();
      appendDebugResponse(debugInfo, `后端原始响应 ${label}`, JSON.stringify(errJson, null, 2));
      errMessage = `${errMessage} - ${errJson.detail || errJson.error || JSON.stringify(errJson)}`;
    } catch {
      const errText = await response.text();
      appendDebugResponse(debugInfo, `后端原始响应 ${label}`, errText);
      errMessage = `${errMessage} - ${errText}`;
    }
    const error = new Error(`${label} 失败：${errMessage}`) as Error & { debugInfo?: DebugInfo };
    error.debugInfo = debugInfo;
    throw error;
  }

  const jsonResponse = await response.json();
  appendDebugResponse(debugInfo, `后端原始响应 ${label}`, JSON.stringify(jsonResponse, null, 2));

  const content = jsonResponse.result;
  if (!content) {
    const error = new Error(`${label} 未返回内容。`) as Error & { debugInfo?: DebugInfo };
    error.debugInfo = debugInfo;
    throw error;
  }

  try {
    const { cleanedContent, data } = parseJsonContent(content);
    appendDebugModelText(debugInfo, label, content, cleanedContent);
    return { data, status: response.status };
  } catch (e) {
    appendDebugModelText(debugInfo, label, content, content.replace(/```json/g, '').replace(/```/g, '').trim());
    debugInfo.parseError = `${label} 解析失败：${e instanceof Error ? e.message : String(e)}`;
    const error = new Error(`${label} 返回格式无法解析，请重试。`) as Error & { debugInfo?: DebugInfo };
    error.debugInfo = debugInfo;
    throw error;
  }
};

export const generateLifeAnalysis = async (input: UserInput): Promise<LifeDestinyResult> => {
  const requestStartedAt = Date.now();
  
  // 1. 【删除】这里不再需要检查 apiKey 和 apiBaseUrl 了
  // 因为 Key 现在保存在 Vercel 的服务器端，用户不需要提供
  
  const genderStr = input.gender === Gender.MALE ? '男 (乾造)' : '女 (坤造)';
  const startAgeInt = parseInt(input.startAge) || 1;
  const yearLimitInt = Math.min(100, Math.max(1, parseInt(input.yearLimit) || 100));
  const maxYearsPerRequestInt = Math.min(yearLimitInt, Math.max(1, parseInt(input.maxYearsPerRequest) || yearLimitInt));
  
  // Calculate Da Yun Direction accurately
  const yearStemPolarity = getStemPolarity(input.yearPillar);
  let isForward = false;

  if (input.gender === Gender.MALE) {
    isForward = yearStemPolarity === 'YANG';
  } else {
    isForward = yearStemPolarity === 'YIN';
  }

  const daYunDirectionStr = isForward ? '顺行 (Forward)' : '逆行 (Backward)';
  
  const directionExample = isForward 
    ? "例如：第一步是【戊申】，第二步则是【己酉】（顺排）" 
    : "例如：第一步是【戊申】，第二步则是【丁未】（逆排）";

  const baseContextPrompt = `
    请根据以下**已经排好的**八字四柱和**指定的大运信息**进行分析。
    
    【基本信息】
    性别：${genderStr}
    姓名：${input.name || "未提供"}
    出生年份：${input.birthYear}年 (阳历)
    
    【八字四柱】
    年柱：${input.yearPillar} (天干属性：${yearStemPolarity === 'YANG' ? '阳' : '阴'})
    月柱：${input.monthPillar}
    日柱：${input.dayPillar}
    时柱：${input.hourPillar}
    
    【大运核心参数】
    1. 起运年龄：${input.startAge} 岁 (虚岁)。
    2. 第一步大运：${input.firstDaYun}。
    3. **排序方向**：${daYunDirectionStr}。
    
    【必须执行的算法 - 大运序列生成】
    请严格按照以下步骤生成数据：
    
    1. **锁定第一步**：确认【${input.firstDaYun}】为第一步大运。
    2. **计算序列**：根据六十甲子顺序和方向（${daYunDirectionStr}），推算出接下来的 9 步大运。
       ${directionExample}
    3. **填充 JSON**：
       - Age 1 到 ${startAgeInt - 1}: daYun = "童限"
       - Age ${startAgeInt} 到 ${startAgeInt + 9}: daYun = [第1步大运: ${input.firstDaYun}]
       - Age ${startAgeInt + 10} 到 ${startAgeInt + 19}: daYun = [第2步大运]
       - Age ${startAgeInt + 20} 到 ${startAgeInt + 29}: daYun = [第3步大运]
       - ...以此类推直到 ${yearLimitInt} 岁。
    
    【特别警告】
    - **daYun 字段**：必须填大运干支（10年一变），**绝对不要**填流年干支。
    - **ganZhi 字段**：填入该年份的**流年干支**（每年一变，例如 2024=甲辰，2025=乙巳）。
    - **输出要求**：只返回 JSON，不要附加解释、前言、总结、Markdown、代码块标题或省略号。
  `;

  const buildMasterPrompt = () => `
${baseContextPrompt}

【第一阶段任务：总纲推演】
- 本次只做总纲分析，不做分年龄流年展开。
- 本次不要输出完整 chartPoints。
- 请重点输出并固定以下内容：
  1. 格局与喜忌
  2. 命理总评
  3. 事业行业
  4. 财富层级
  5. 婚姻情感
  6. 身体健康
  7. 六亲关系
- 可返回空数组 \`chartPoints: []\`，但其他分析字段必须完整。
  `;

  const buildChunkPrompt = (startAge: number, endAge: number, masterGuide: string) => `
${baseContextPrompt}

【第一阶段总纲，必须作为本次推演的固定依据】
${masterGuide}

【第二阶段任务：分段流年推演】
- 本次只输出 Age ${startAge} 到 ${endAge} 的数据。
- chartPoints 必须严格返回 ${endAge - startAge + 1} 条数据。
- age 必须从 ${startAge} 连续到 ${endAge}，不能包含范围外年龄。
- 本次不要重复输出新的命理总评，请沿用第一阶段总纲。

任务：
1. 生成 **${startAge}-${endAge} 岁 (虚岁)** 的人生流年K线数据。
2. 在 \`reason\` 字段中提供流年详批。
3. 保持与第一阶段总纲完全一致的判断口径。
  `;

  const debugInfo: DebugInfo = {
    enabled: Boolean(input.debugMode),
    requestPayload: '',
  };

  try {
    console.info('[LifeKLine] 开始推演', {
      modelName: input.modelName,
      apiBaseUrl: input.apiBaseUrl,
      birthYear: input.birthYear,
      firstDaYun: input.firstDaYun,
      yearLimit: yearLimitInt,
      maxYearsPerRequest: maxYearsPerRequestInt,
      queryStrategy: input.queryStrategy,
    });
    const chartData: any[] = [];
    let finalAnalysis: LifeDestinyResult["analysis"] | null = null;
    let masterGuide = '';
    let lastStatus = 200;

    if (input.queryStrategy === 'plan2') {
      const singleRequestBody = {
        prompt: `${baseContextPrompt}

【原始单次整段推演方案】
- 本次一次性输出 Age 1 到 ${yearLimitInt} 的完整数据。
- chartPoints 必须严格返回 ${yearLimitInt} 条数据。
- age 必须从 1 连续到 ${yearLimitInt}。

任务：
1. 确认格局与喜忌。
2. 生成 **1-${yearLimitInt} 岁 (虚岁)** 的人生流年K线数据。
3. 在 \`reason\` 字段中提供流年详批。
4. 生成带评分的命理分析报告。`,
        systemInstruction: BAZI_SYSTEM_INSTRUCTION,
        modelName: input.modelName,
        apiBaseUrl: input.apiBaseUrl,
        apiKey: input.apiKey,
      };

      appendDebugRequest(debugInfo, '提交给后端的请求体 方案2单次整段推演', singleRequestBody, input.apiKey);
      console.info('[LifeKLine] 开始方案2单次整段推演');

      const singleResult = await executeModelRequest(
        '方案2单次整段推演',
        singleRequestBody,
        requestStartedAt,
        debugInfo
      );

      if (!singleResult.data.chartPoints || !Array.isArray(singleResult.data.chartPoints)) {
        debugInfo.parseError = '方案2缺少 chartPoints。';
        const error = new Error('方案2返回格式不正确（缺失 chartPoints）。') as Error & { debugInfo?: DebugInfo };
        error.debugInfo = debugInfo;
        throw error;
      }

      finalAnalysis = extractAnalysis(singleResult.data);
      chartData.push(...validateChartPoints(singleResult.data.chartPoints, 1, yearLimitInt, '方案2单次整段推演', debugInfo));
      lastStatus = singleResult.status;
    } else {
      const masterRequestBody = {
        prompt: buildMasterPrompt(),
        systemInstruction: BAZI_SYSTEM_INSTRUCTION,
        modelName: input.modelName,
        apiBaseUrl: input.apiBaseUrl,
        apiKey: input.apiKey,
      };

      appendDebugRequest(debugInfo, '提交给后端的请求体 总纲推演', masterRequestBody, input.apiKey);
      console.info('[LifeKLine] 开始总纲推演');

      const masterResult = await executeModelRequest(
        '总纲推演',
        masterRequestBody,
        requestStartedAt,
        debugInfo
      );

      finalAnalysis = extractAnalysis(masterResult.data);
      masterGuide = buildMasterGuide(finalAnalysis);
      lastStatus = masterResult.status;
      appendDebugResponse(debugInfo, '总纲摘要', masterGuide);

      for (let chunkStart = 1; chunkStart <= yearLimitInt; chunkStart += maxYearsPerRequestInt) {
        const chunkEnd = Math.min(yearLimitInt, chunkStart + maxYearsPerRequestInt - 1);
        const requestBody = {
          prompt: buildChunkPrompt(chunkStart, chunkEnd, masterGuide),
          systemInstruction: BAZI_SYSTEM_INSTRUCTION,
          modelName: input.modelName,
          apiBaseUrl: input.apiBaseUrl,
          apiKey: input.apiKey,
        };

        appendDebugRequest(debugInfo, `提交给后端的请求体 ${chunkStart}-${chunkEnd}`, requestBody, input.apiKey);

        console.info('[LifeKLine] 开始分段推演', {
          chunkStart,
          chunkEnd,
          hasMasterGuide: Boolean(masterGuide),
        });

        const { data, status } = await executeModelRequest(
          `${chunkStart}-${chunkEnd} 岁分段推演`,
          requestBody,
          requestStartedAt,
          debugInfo
        );
        lastStatus = status;

        if (!data.chartPoints || !Array.isArray(data.chartPoints)) {
          debugInfo.parseError = `第 ${chunkStart}-${chunkEnd} 岁分段缺少 chartPoints。`;
          const error = new Error(`第 ${chunkStart}-${chunkEnd} 岁分段返回格式不正确（缺失 chartPoints）。`) as Error & { debugInfo?: DebugInfo };
          error.debugInfo = debugInfo;
          throw error;
        }

        chartData.push(...validateChartPoints(data.chartPoints, chunkStart, chunkEnd, `第 ${chunkStart}-${chunkEnd} 岁分段`, debugInfo));
      }
    }

    debugInfo.responseStatus = lastStatus;

    if (chartData.length !== yearLimitInt) {
      debugInfo.parseError = `合并后的 chartPoints 数量不正确：期望 ${yearLimitInt} 条，实际 ${chartData.length} 条。`;
      const error = new Error(`合并后的推演结果不完整：期望 ${yearLimitInt} 年，实际 ${chartData.length} 年。`) as Error & { debugInfo?: DebugInfo };
      error.debugInfo = debugInfo;
      throw error;
    }

    return {
      chartData,
      analysis: finalAnalysis || extractAnalysis({}),
      debugInfo: input.debugMode ? debugInfo : undefined,
    };
  } catch (error) {
    console.error("[LifeKLine] 推演失败", error);
    throw error;
  }
};
