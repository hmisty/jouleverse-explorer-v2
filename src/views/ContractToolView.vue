<template>
  <div class="contract-tool-view">
    <div class="back-row">
      <router-link to="/tools" class="back-link">← 返回工具集</router-link>
    </div>

    <ContractTool v-if="contract" :contract="contract" />

    <div v-else class="not-found">
      <JvPageState
        type="search-empty"
        title="未找到该合约工具"
        description="合约可能已下线或地址有误"
        action="返回工具集"
        @action="$router.push('/tools')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ContractTool from '../components/ContractTool.vue'
import JvPageState from '../design-system/components/JvPageState.vue'
import { getToolboxContract } from '../contracts/toolbox'

const route = useRoute()
const contract = computed(() => getToolboxContract(String(route.params.key)))
</script>

<style scoped>
.contract-tool-view {
  min-height: 60vh;
}

.back-row {
  max-width: 1100px;
  margin: 0 auto;
  padding: 18px 24px 0;
}

.back-link {
  color: var(--jv-link);
  text-decoration: none;
  font-size: 0.9rem;
}

.back-link:hover {
  color: var(--jv-link-hover);
  text-decoration: underline;
}

.not-found {
  max-width: 600px;
  margin: 60px auto;
}
</style>
