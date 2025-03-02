<template>
  <div class="profile-container">
    <h2>Profile</h2>

    <div class="profile-info">
      <img :src="trilogyIcon" alt="User Avatar" class="avatar" />
      <div class="details">
        <p><strong>User Name:</strong> {{ profile.name }}</p>
        <p v-if="profile.email"><strong>Email:</strong> {{ profile.email }}</p>
        <p v-if="profile.organization"><strong>Organization:</strong> {{ profile.organization }}</p>
      </div>
    </div>

    <!-- <button @click="editProfile">Edit Profile</button> -->
  </div>
</template>

<script lang="ts">
import { defineComponent, reactive } from 'vue'
import trilogyIcon from '../static/trilogy.png'
// Assume Pinia will provide real data later
// import { useUserProfileStore } from "@/stores/userProfile";

export default defineComponent({
  name: 'UserProfile',
  setup() {
    // Mock user profile (to be replaced with Pinia store later)
    const profile = reactive({
      name: 'Anonymous',
      email: null,
      organization: null,
      // role: 'Admin',
    })

    const editProfile = () => {
      console.log('Edit profile clicked')
      // Future implementation: Open edit modal or navigate to edit page
    }

    return {
      profile,
      editProfile,
      trilogyIcon,
    }
  },
})
</script>

<style scoped>
.profile-container {
  padding: 20px;
  /* max-width: 400px; */
  border: var(--border);
  border-radius: 8px;
  background: var(--main-bg-color);
  text-align: center;
}

.profile-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

.avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

.details {
  text-align: left;
}
</style>
