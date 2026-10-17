import { createRouter, createWebHashHistory } from 'vue-router'
import Blocks from '../views/Blocks.vue'
import BlockDetail from '../views/BlockDetail.vue'
import TransactionDetail from '../views/TransactionDetail.vue'
import AddressDetail from '../views/AddressDetail.vue'
import Home from '../views/Home.vue'
import JNSQuery from '../views/JNSQuery.vue'
import CoreCheckinStats from '../views/CoreCheckinStats.vue'
import ToolsHome from '../views/ToolsHome.vue'
import ContractToolView from '../views/ContractToolView.vue'
import MerkleProofGenerator from '../views/MerkleProofGenerator.vue'
import JNSVote from '../views/JNSVote.vue'
import JnsDomains from '../views/JnsDomains.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home
  },
  {
    path: '/core/checkin',
    name: 'coreCheckinStats',
    component: CoreCheckinStats
  },
  {
    path: '/tools',
    name: 'toolsHome',
    component: ToolsHome
  },
  {
    path: '/tools/contract/:key',
    name: 'contractTool',
    component: ContractToolView,
    props: true
  },
  {
    path: '/tools/merkle',
    name: 'merkleProofGenerator',
    component: MerkleProofGenerator
  },
  {
    path: '/jnsvote',
    name: 'jnsvote',
    component: JNSVote
  },
  {
    path: '/blocks',
    name: 'blocks',
    component: Blocks
  },
  {
    path: '/block/:number',
    name: 'blockDetail',
    component: BlockDetail,
    props: true
  },
  {
    path: '/tx/:hash',
    name: 'transactionDetail',
    component: TransactionDetail,
    props: true
  },
  {
    path: '/address/:address',
    name: 'addressDetail',
    component: AddressDetail,
    props: true
  },
  {
    path: '/jns',
    name: 'jnsQuery',
    component: JNSQuery
  },
  {
    path: '/domains',
    name: 'jnsDomains',
    component: JnsDomains
  },
  {
    path: '/jns/:name',
    name: 'jnsDetail',
    component: JNSQuery
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
