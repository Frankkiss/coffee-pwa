import type { BrewTemplate, BrewTemplatePourStep } from './brewTemplateTypes'

function step(order: number, startSeconds: number, endSeconds: number | null, targetWaterGrams: number, label: string, action: string): BrewTemplatePourStep {
  return { order, startSeconds, endSeconds, targetWaterGrams, label, action }
}

function core(template: Omit<BrewTemplate, 'isChampionReference'>): BrewTemplate {
  return { ...template, isChampionReference: false }
}

export const brewTemplates: BrewTemplate[] = [
  core({
    id: 'hot-hoffmann-one-cup-v60', name: 'Hoffmann 单杯 V60', category: 'daily-pourover', difficulty: 'easy', brewMode: 'hot_pourover', brewer: 'V60', filter: '锥形滤纸', doseGrams: 15, waterGrams: 250, ratio: '1:16.7', waterTemperatureC: { min: 93, max: 96 }, grindSize: '中细', targetTimeSeconds: { min: 150, max: 210 },
    pourSteps: [step(1, 0, 45, 50, '闷蒸', '快速湿润全部咖啡粉，轻晃滤杯。'), step(2, 45, 70, 150, '主注水', '稳定绕圈注水到 150g。'), step(3, 70, 110, 250, '收尾', '放低水流注至 250g，轻晃后等待滴滤。')], suitableFor: ['浅烘', '中浅烘', '均衡', '清晰'], avoidFor: ['深烘'], flavorGoal: '均匀萃取并兼顾清晰度与甜感。', adjustmentRules: ['酸尖时研磨略细；苦涩时先减少尾段扰动。'], sourceNotes: '参考 James Hoffmann 单杯 V60 方法，按家庭单杯剂量整理。', sourceUrls: ['https://www.youtube.com/watch?v=1oB1oDrDkHM'],
  }),
  core({
    id: 'hot-tetsu-46', name: '粕谷哲 4:6 甜感法', category: 'daily-pourover', difficulty: 'medium', brewMode: 'hot_pourover', brewer: 'V60', filter: '锥形滤纸', doseGrams: 15, waterGrams: 225, ratio: '1:15', waterTemperatureC: { min: 90, max: 93 }, grindSize: '中粗', targetTimeSeconds: { min: 165, max: 210 },
    pourSteps: [step(1, 0, 40, 45, '第一投', '注水到 45g，等待水位明显下降。'), step(2, 40, 80, 90, '第二投', '注水到 90g，建立甜酸平衡。'), step(3, 80, 115, 135, '第三投', '注水到 135g。'), step(4, 115, 150, 180, '第四投', '注水到 180g。'), step(5, 150, 185, 225, '第五投', '注水到 225g，等待滴滤完成。')], suitableFor: ['日晒', '蜜处理', '甜感', '层次'], avoidFor: ['易堵塞细粉'], flavorGoal: '通过前 40% 调整甜酸、后 60% 调整浓度。', adjustmentRules: ['想更甜时略增第一投、等量减少第二投。'], sourceNotes: '参考 Tetsu Kasuya 4:6 方法的视频示范。', sourceUrls: ['https://www.youtube.com/watch?v=wmCW8xSWGZY'],
  }),
  core({
    id: 'hot-lance-universal', name: 'Lance 通用两段手冲', category: 'daily-pourover', difficulty: 'easy', brewMode: 'hot_pourover', brewer: '锥形滤杯', filter: '锥形滤纸', doseGrams: 15, waterGrams: 250, ratio: '1:16.7', waterTemperatureC: { min: 92, max: 96 }, grindSize: '中细偏粗', targetTimeSeconds: { min: 135, max: 195 },
    pourSteps: [step(1, 0, 45, 45, '充分闷蒸', '注水到 45g，轻柔搅动确保无干粉。'), step(2, 45, 105, 250, '连续主注水', '以低到中等水流连续注到 250g，结束时轻晃。')], suitableFor: ['浅烘', '水洗', '日常', '清晰'], avoidFor: ['深烘高溶解度'], flavorGoal: '用少分段和均匀粉床降低手法波动。', adjustmentRules: ['流速过快且味淡时研磨略细，堵塞时减少搅动。'], sourceNotes: '参考 Lance Hedrick 通用手冲思路，保留闷蒸与一次主注水。', sourceUrls: ['https://www.youtube.com/watch?v=BG5Tc8MR2_4'],
  }),
  core({
    id: 'hot-april-four-pour', name: 'April 平底四段法', category: 'daily-pourover', difficulty: 'easy', brewMode: 'hot_pourover', brewer: 'April 平底滤杯', filter: '平底滤纸', doseGrams: 13, waterGrams: 200, ratio: '1:15.4', waterTemperatureC: { min: 92, max: 94 }, grindSize: '中粗', targetTimeSeconds: { min: 150, max: 210 },
    pourSteps: [step(1, 0, 30, 50, '第一段', '中心与小圈组合注水到 50g。'), step(2, 30, 60, 100, '第二段', '同样水流注到 100g。'), step(3, 60, 90, 150, '第三段', '注到 150g，保持低扰动。'), step(4, 90, 120, 200, '第四段', '注到 200g，等待滴滤。')], suitableFor: ['浅烘', '甜感', '平衡', '平底滤杯'], avoidFor: ['极细研磨'], flavorGoal: '以重复的等量注水建立稳定甜感。', adjustmentRules: ['总时长过长先研磨略粗，不额外增加搅动。'], sourceNotes: '参考 April Coffee 四次等量注水方法。', sourceUrls: ['https://www.youtube.com/watch?v=otk2jFRCcmE'],
  }),
  core({
    id: 'hot-orea-balanced-flat', name: 'Orea 平底均衡法', category: 'daily-pourover', difficulty: 'easy', brewMode: 'hot_pourover', brewer: 'Orea 平底滤杯', filter: '平底滤纸', doseGrams: 15, waterGrams: 240, ratio: '1:16', waterTemperatureC: { min: 92, max: 95 }, grindSize: '中细', targetTimeSeconds: { min: 120, max: 165 },
    pourSteps: [step(1, 0, 35, 45, '闷蒸', '注水到 45g，轻晃使粉床均匀。'), step(2, 35, 70, 140, '第一段', '稳定注水到 140g。'), step(3, 70, 105, 240, '第二段', '注水到 240g，减少滤纸边缘冲刷。')], suitableFor: ['浅烘', '花香', '清晰', '甜感'], avoidFor: ['深烘'], flavorGoal: '利用快流平底结构取得清晰而完整的甜感。', adjustmentRules: ['味薄时研磨略细，干涩时降低尾段流速。'], sourceNotes: '参考 Orea V3/V4 公布的平底滤杯冲煮指南。', sourceUrls: ['https://orea.uk/guides-v3'],
  }),
  core({
    id: 'hot-orea-low-agitation', name: 'Orea 低扰动单主注', category: 'daily-pourover', difficulty: 'medium', brewMode: 'hot_pourover', brewer: 'Orea 平底滤杯', filter: '平底滤纸', doseGrams: 15, waterGrams: 250, ratio: '1:16.7', waterTemperatureC: { min: 91, max: 94 }, grindSize: '中细', targetTimeSeconds: { min: 115, max: 160 },
    pourSteps: [step(1, 0, 40, 50, '闷蒸', '低水流注到 50g，不额外搅拌。'), step(2, 40, 105, 250, '单次主注水', '连续注到 250g，保持水柱稳定并避免冲击边缘。')], suitableFor: ['日晒', '蜜处理', '高发酵', '柔和'], avoidFor: ['难萃极浅烘'], flavorGoal: '减少扰动，压低发酵刺激并保留果甜。', adjustmentRules: ['萃取不足时优先研磨略细，不增加猛烈搅动。'], sourceNotes: '依据 Orea 低扰动配方方向整理为单主注版本。', sourceUrls: ['https://orea.uk/guides-v3'],
  }),
  core({
    id: 'hot-tetsu-neo', name: '粕谷哲 NEO 高萃法', category: 'daily-pourover', difficulty: 'advanced', brewMode: 'hot_pourover', brewer: 'V60', filter: '锥形滤纸', doseGrams: 15, waterGrams: 240, ratio: '1:16', waterTemperatureC: { min: 90, max: 94 }, grindSize: '偏细', targetTimeSeconds: { min: 120, max: 175 },
    pourSteps: [step(1, 0, 45, 60, '长闷蒸', '注水到 60g，均匀浸润并静置。'), step(2, 45, 75, 120, '高萃取段', '较集中注水到 120g。'), step(3, 75, 110, 180, '稀释段一', '放缓水流注到 180g。'), step(4, 110, 145, 240, '稀释段二', '注到 240g，等待滴滤完成。')], suitableFor: ['极浅烘', '高密度', '花香'], avoidFor: ['深烘', '易涩豆'], flavorGoal: '用细研磨和分段结构提高浅烘萃取。', adjustmentRules: ['出现干涩时先研磨略粗或缩短前段接触。'], sourceNotes: '参考粕谷哲 NEO Brew 公开演示整理。', sourceUrls: ['https://www.bilibili.com/video/BV1wyV562Eyq/'],
  }),
  core({
    id: 'hot-frontstreet-geisha', name: 'FrontStreet 瑰夏三段法', category: 'bean-specific', difficulty: 'medium', brewMode: 'hot_pourover', brewer: 'V60', filter: '锥形滤纸', doseGrams: 15, waterGrams: 255, ratio: '1:17', waterTemperatureC: { min: 92, max: 94 }, grindSize: '中细偏粗', targetTimeSeconds: { min: 130, max: 180 },
    pourSteps: [step(1, 0, 35, 45, '闷蒸', '注到 45g，确保均匀湿润。'), step(2, 35, 75, 150, '香气段', '中心向外注到 150g，避免高扰动。'), step(3, 75, 120, 255, '收尾', '注到 255g，保持较快落水。')], suitableFor: ['瑰夏', '水洗', '花香', '茶感'], avoidFor: ['深烘', '追求厚重'], flavorGoal: '用较高水比拉开花香与茶感。', adjustmentRules: ['香气闷时研磨略粗，酸尖时延长闷蒸而非大幅升温。'], sourceNotes: '参考 FrontStreet 对高香气豆 1:17 三段冲煮的分享。', sourceUrls: ['https://www.bilibili.com/opus/508189472590867145'],
  }),
  core({
    id: 'hot-gout-shallow-five-pour', name: 'Goût 浅烘五段甜感法', category: 'daily-pourover', difficulty: 'medium', brewMode: 'hot_pourover', brewer: 'V60', filter: '锥形滤纸', doseGrams: 15, waterGrams: 240, ratio: '1:16', waterTemperatureC: { min: 92, max: 95 }, grindSize: '中细', targetTimeSeconds: { min: 140, max: 190 },
    pourSteps: [step(1, 0, 35, 45, '闷蒸', '注水到 45g。'), step(2, 35, 65, 90, '第一段', '注到 90g。'), step(3, 65, 95, 140, '第二段', '注到 140g。'), step(4, 95, 125, 190, '第三段', '注到 190g。'), step(5, 125, 155, 240, '收尾', '注到 240g，等待滴滤。')], suitableFor: ['浅烘', '日晒', '莓果', '甜感'], avoidFor: ['细粉多易堵塞'], flavorGoal: '以温和脉冲提高甜感和层次。', adjustmentRules: ['堵塞时合并中间两段，苦涩时降低 1°C。'], sourceNotes: '参考 Goût & Co 主理人公开的浅烘基础冲煮分享。', sourceUrls: ['https://www.bilibili.com/video/BV1LiLEzvEwE/'],
  }),
  core({
    id: 'hot-frontstreet-fine-fast', name: 'FrontStreet 细研磨快冲', category: 'daily-pourover', difficulty: 'advanced', brewMode: 'hot_pourover', brewer: 'V60', filter: '锥形滤纸', doseGrams: 15, waterGrams: 240, ratio: '1:16', waterTemperatureC: { min: 92, max: 95 }, grindSize: '中细偏细', targetTimeSeconds: { min: 105, max: 145 },
    pourSteps: [step(1, 0, 30, 45, '快速闷蒸', '注到 45g，轻晃一次。'), step(2, 30, 65, 150, '快速主注', '较大水流注到 150g。'), step(3, 65, 100, 240, '快速收尾', '连续注到 240g，减少停顿。')], suitableFor: ['浅烘', '高密度', '高萃取'], avoidFor: ['细粉多', '深烘'], flavorGoal: '用较细研磨配合快流缩短接触，兼顾萃取与干净度。', adjustmentRules: ['超过目标时间先研磨略粗，不增加绕圈。'], sourceNotes: '参考 FrontStreet 对细研磨、快水流三段式的参数分享。', sourceUrls: ['https://www.bilibili.com/opus/905306868952334361'],
  }),
  core({
    id: 'hot-frontstreet-dark-low-temp', name: 'FrontStreet 深烘低温法', category: 'bean-specific', difficulty: 'easy', brewMode: 'hot_pourover', brewer: 'V60', filter: '锥形滤纸', doseGrams: 15, waterGrams: 210, ratio: '1:14', waterTemperatureC: { min: 82, max: 86 }, grindSize: '中粗', targetTimeSeconds: { min: 100, max: 145 },
    pourSteps: [step(1, 0, 30, 40, '闷蒸', '低温注水到 40g，不搅拌。'), step(2, 30, 70, 125, '主注水', '低水流注到 125g。'), step(3, 70, 105, 210, '收尾', '注到 210g，水位下降后及时移杯。')], suitableFor: ['中深烘', '深烘', '坚果', '巧克力'], avoidFor: ['极浅烘'], flavorGoal: '降低苦涩和焦感，保留甜感与醇厚度。', adjustmentRules: ['仍苦时再降 2°C 或研磨略粗；空淡时提高水比到 1:15。'], sourceNotes: '参考 FrontStreet 深烘豆低温冲煮建议。', sourceUrls: ['https://www.bilibili.com/opus/502351843232151175'],
  }),
  core({
    id: 'iced-orea-flash', name: 'Orea Flash 冰手冲', category: 'daily-pourover', difficulty: 'easy', brewMode: 'iced_pourover', brewer: 'Orea 平底滤杯', filter: '平底滤纸', doseGrams: 15, waterGrams: 225, ratio: '1:15', waterTemperatureC: { min: 92, max: 95 }, grindSize: '中细', targetTimeSeconds: { min: 105, max: 150 },
    pourSteps: [step(1, 0, 35, 45, '闷蒸', '下壶预置 75g 冰；热水注到 45g。'), step(2, 35, 75, 100, '主注水', '注热水到累计 100g。'), step(3, 75, 110, 225, '收尾', '注热水到 150g，滴滤后与 75g 冰充分摇匀。')], suitableFor: ['浅烘', '花香', '明亮', '夏季'], avoidFor: ['深烘'], flavorGoal: '快速降温并保留明亮香气和甜感。', adjustmentRules: ['成品偏淡时保持总量不变，减少冰量并增加热水。'], sourceNotes: '参考 Orea Flash Brew 指南，模板总水量含 75g 冰。', sourceUrls: ['https://orea.uk/guides-v4'],
  }),
  core({
    id: 'iced-seven-miles-177', name: 'Seven Miles 1:7:7 冰手冲', category: 'daily-pourover', difficulty: 'easy', brewMode: 'iced_pourover', brewer: 'V60', filter: '锥形滤纸', doseGrams: 15, waterGrams: 210, ratio: '1:14', waterTemperatureC: { min: 92, max: 95 }, grindSize: '中细', targetTimeSeconds: { min: 100, max: 145 },
    pourSteps: [step(1, 0, 35, 45, '闷蒸', '下壶预置 105g 冰；热水注到 45g。'), step(2, 35, 80, 105, '热水段', '继续注热水到 105g。'), step(3, 80, 110, 210, '冷却完成', '滴滤结束后与 105g 冰旋转混合至充分冷却。')], suitableFor: ['浅烘', '水果调', '高香气'], avoidFor: ['追求高浓度'], flavorGoal: '等量热水和冰快速冷却，得到轻盈清爽杯感。', adjustmentRules: ['冰未完全融化属正常；偏淡时将热水与冰改为 8:6。'], sourceNotes: '参考 Seven Miles 冰手冲 1:7:7 思路，总水量按热水加冰计算。', sourceUrls: ['https://www.sevenmiles.com.au/blogs/editorial/iced-coffee-tips'],
  }),
  core({
    id: 'cold-ready-hoffmann-fridge', name: 'Hoffmann 冰箱冷萃', category: 'cold-brew', difficulty: 'easy', brewMode: 'cold_brew', brewVariant: 'ready_to_drink', brewer: '冷萃壶', filter: '滤袋或细滤网', doseGrams: 60, waterGrams: 800, ratio: '1:13.3', waterTemperatureC: { min: 4, max: 8 }, grindSize: '中粗', targetTimeSeconds: { min: 43200, max: 64800 },
    pourSteps: [step(1, 0, 60, 800, '混合', '咖啡粉与冷水充分混合，确认无干粉。'), step(2, 60, 43200, 800, '冷藏浸泡', '密封后冷藏 12-18 小时。'), step(3, 43200, null, 800, '过滤', '缓慢过滤，不挤压粉层，冷藏保存并直接饮用。')], suitableFor: ['直接饮用', '清爽', '低苦'], avoidFor: ['浓缩基底'], flavorGoal: '以约 75g/L 建立干净、可直接饮用的冷萃。', adjustmentRules: ['苦涩时缩短到 12 小时，偏淡时提高粉量而非延长超过 18 小时。'], sourceNotes: '参考 James Hoffmann 冷萃建议，以冰箱温度和约 75g/L 整理。', sourceUrls: ['https://www.youtube.com/watch?v=AB0QLjroFss'],
  }),
  core({
    id: 'cold-ready-gout-prewet', name: 'Goût 预浸润冷萃', category: 'cold-brew', difficulty: 'medium', brewMode: 'cold_brew', brewVariant: 'ready_to_drink', brewer: '冷萃壶', filter: '滤袋或细滤网', doseGrams: 60, waterGrams: 720, ratio: '1:12', waterTemperatureC: { min: 4, max: 8 }, grindSize: '中粗', targetTimeSeconds: { min: 43200, max: 64800 },
    pourSteps: [step(1, 0, 60, 120, '预浸润', '先用 120g 常温水均匀湿润咖啡粉。'), step(2, 60, 180, 720, '补水', '补入冷水到 720g，轻搅一次。'), step(3, 180, 43200, 720, '冷藏浸泡', '密封冷藏 12-18 小时。'), step(4, 43200, null, 720, '过滤', '过滤后直接饮用，避免挤压滤袋。')], suitableFor: ['直接饮用', '甜感', '圆润'], avoidFor: ['浓缩基底'], flavorGoal: '预先湿润减少结团，得到均衡甜感。', adjustmentRules: ['发酵感过强时缩短时间或改用更低温冷藏。'], sourceNotes: '参考 Goût & Co 主理人冷萃分享，采用预湿后冷藏的家庭做法。', sourceUrls: ['https://www.bilibili.com/video/BV1WtM1zgECb'],
  }),
  core({
    id: 'cold-concentrate-toddy', name: 'Toddy 经典冷萃浓缩', category: 'cold-brew', difficulty: 'easy', brewMode: 'cold_brew', brewVariant: 'concentrate', brewer: '冷萃壶', filter: '滤袋或细滤网', doseGrams: 100, waterGrams: 550, ratio: '1:5.5', waterTemperatureC: { min: 18, max: 24 }, grindSize: '粗', targetTimeSeconds: { min: 43200, max: 86400 },
    pourSteps: [step(1, 0, 120, 550, '分层加水', '交替加入咖啡粉与水，最后确认全部湿润。'), step(2, 120, 43200, 550, '浸泡', '室温或冷藏浸泡 12-24 小时，避免频繁搅动。'), step(3, 43200, null, 550, '过滤浓缩液', '自然过滤，饮用时再按口味兑水或牛奶。')], suitableFor: ['浓缩基底', '兑奶', '批量制作'], avoidFor: ['直接大杯饮用'], flavorGoal: '制作稳定、便于稀释的高浓度冷萃基底。', adjustmentRules: ['兑水后仍苦时缩短浸泡；浓度不足时减少用水。'], sourceNotes: '参考 Toddy 家用系统冲煮说明，缩放为 100g 粉的家庭批次。', sourceUrls: ['https://toddycafe.com/downloads/THMBGN-brewing-instructions.pdf'],
  }),
  core({
    id: 'cold-concentrate-seven-miles', name: 'Seven Miles 1:5 冷萃浓缩', category: 'cold-brew', difficulty: 'easy', brewMode: 'cold_brew', brewVariant: 'concentrate', brewer: '冷萃壶', filter: '滤袋或细滤网', doseGrams: 100, waterGrams: 500, ratio: '1:5', waterTemperatureC: { min: 4, max: 8 }, grindSize: '粗', targetTimeSeconds: { min: 72000, max: 86400 },
    pourSteps: [step(1, 0, 90, 500, '混合', '加入冷水到 500g，缓慢搅拌至无明显干粉。'), step(2, 90, 72000, 500, '冷藏浸泡', '密封冷藏 20-24 小时。'), step(3, 72000, null, 500, '过滤浓缩液', '自然过滤后冷藏，按 1:1 左右兑水或奶起步。')], suitableFor: ['浓缩基底', '兑奶', '冰饮'], avoidFor: ['未经稀释直接饮用'], flavorGoal: '制作高浓度、适合兑奶或冰饮的冷萃。', adjustmentRules: ['涩感明显时缩短至 20 小时，偏淡时减少稀释比例。'], sourceNotes: '参考 Seven Miles 冷萃指南的 1:5 浓缩方案。', sourceUrls: ['https://www.sevenmiles.com.au/blogs/editorial/cold-brew-coffee-guide'],
  }),
  core({
    id: 'espresso-medium-balanced', name: '中烘 1:2 平衡意式', category: 'bean-specific', difficulty: 'easy', brewMode: 'espresso', brewer: '意式咖啡机', filter: '双份粉碗', doseGrams: 18, waterGrams: 36, ratio: '1:2', waterTemperatureC: { min: 92, max: 93 }, grindSize: '意式细研磨', targetTimeSeconds: { min: 25, max: 30 },
    pourSteps: [step(1, 0, 0, 0, '准备', '称量 18g，均匀布粉压粉；以粉碗额定粉量为准。'), step(2, 0, 30, 36, '萃取', '从启动计时，以杯中重量为准在 36g 附近停止。')], suitableFor: ['中烘', '平衡', '甜感', '牛奶饮品'], avoidFor: ['极浅烘'], flavorGoal: '用 1:2 建立甜、酸、苦平衡的日常基准。', adjustmentRules: ['先固定粉量和出液量，再用研磨调整时间；酸尖可略细，苦干可略粗。'], sourceNotes: '综合国内咖啡师日常意式校准分享，采用 18g/36g/25-30 秒基准。', sourceUrls: ['https://www.bilibili.com/video/BV1XZ421J7ok/'],
  }),
  core({
    id: 'espresso-light-high-extraction', name: '浅烘高萃取意式', category: 'bean-specific', difficulty: 'advanced', brewMode: 'espresso', brewer: '意式咖啡机', filter: '双份粉碗', doseGrams: 18, waterGrams: 45, ratio: '1:2.5', waterTemperatureC: { min: 94, max: 95 }, grindSize: '意式细研磨', targetTimeSeconds: { min: 28, max: 35 },
    pourSteps: [step(1, 0, 8, 0, '预浸润', '设备支持时低压预浸润，观察粉饼均匀出液。'), step(2, 8, 35, 45, '延长出液', '稳定萃取到 45g；以甜感和干净度判断是否继续延长。')], suitableFor: ['浅烘', '花果香', '高酸质'], avoidFor: ['深烘'], flavorGoal: '以较高温度和较长比例提高浅烘萃取与甜感。', adjustmentRules: ['仍尖酸可把出液逐步延长至 48-54g；出现空涩则回退出液并略粗研磨。'], sourceNotes: '参考 Lance Hedrick 浅烘意式高萃取思路，并按家用双份粉碗收敛参数。', sourceUrls: ['https://www.youtube.com/watch?v=hrCQKAXJr7s'],
  }),
  core({
    id: 'espresso-dark-short-low-temp', name: '中深烘低温短比例意式', category: 'bean-specific', difficulty: 'easy', brewMode: 'espresso', brewer: '意式咖啡机', filter: '双份粉碗', doseGrams: 18, waterGrams: 27, ratio: '1:1.5', waterTemperatureC: { min: 90, max: 92 }, grindSize: '意式细研磨', targetTimeSeconds: { min: 22, max: 27 },
    pourSteps: [step(1, 0, 0, 0, '准备', '称量 18g 并均匀布粉，避免过度压实。'), step(2, 0, 27, 27, '短比例萃取', '以重量为准在 27g 附近停止，避免尾段苦涩。')], suitableFor: ['中深烘', '深烘', '坚果', '巧克力', '兑奶'], avoidFor: ['极浅烘'], flavorGoal: '以低温和短比例保留醇厚甜感，减少焦苦。', adjustmentRules: ['苦味突出时降低 1°C 或缩短出液；酸空时略延长到 30-32g。'], sourceNotes: '综合国内主理人对烘焙度、温度和出液比的调校建议。', sourceUrls: ['https://www.bilibili.com/read/cv16086302/'],
  }),
]
