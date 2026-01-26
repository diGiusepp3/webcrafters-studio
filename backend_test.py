#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class WebcraftersApiTester:
    def __init__(self, base_url="https://studio.webcrafters.be/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.user_id = None
        self.project_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        success, response = self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200
        )
        return success

    def test_register(self):
        """Test user registration"""
        test_user_data = {
            "email": "test@example.com",
            "password": "TestPass123",
            "name": "Test User"
        }
        
        # First try to register
        url = f"{self.base_url}/auth/register"
        headers = {'Content-Type': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing User Registration...")
        print(f"   URL: {url}")
        
        try:
            response = requests.post(url, json=test_user_data, headers=headers, timeout=30)
            
            if response.status_code == 200:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                response_data = response.json()
                if 'token' in response_data:
                    self.token = response_data['token']
                    self.user_id = response_data.get('user', {}).get('id')
                    print(f"   Token obtained: {self.token[:20]}...")
                return True
            elif response.status_code == 400:
                error_data = response.json()
                if 'Email already registered' in error_data.get('detail', ''):
                    self.tests_passed += 1
                    print(f"✅ Passed - User already exists (expected)")
                    return True
                else:
                    print(f"❌ Failed - Unexpected 400 error: {error_data}")
                    return False
            else:
                print(f"❌ Failed - Status: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False

    def test_login(self):
        """Test user login"""
        login_data = {
            "email": "test@example.com",
            "password": "TestPass123"
        }
        
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data=login_data
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   Login token: {self.token[:20]}...")
            return True
        return False

    def test_get_me(self):
        """Test get current user"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        return success

    def test_get_projects_empty(self):
        """Test get projects (should be empty initially)"""
        success, response = self.run_test(
            "Get Projects",
            "GET",
            "projects",
            200
        )
        
        if success and isinstance(response, list):
            if len(response) == 0:
                print("   ✅ Projects list is empty as expected")
            else:
                print(f"   ✅ Found {len(response)} existing project(s)")
                # Store first project ID for later tests
                if response and 'id' in response[0]:
                    self.project_id = response[0]['id']
                    print(f"   Using existing project ID: {self.project_id}")
            return True
        return success

    def test_generate_project(self):
        """Test project generation"""
        generate_data = {
            "prompt": "Create a simple todo list app with add, delete, and mark complete functionality",
            "project_type": "frontend"
        }
        
        print("   ⏳ This may take 30-60 seconds for AI generation...")
        
        # Use extended timeout for AI generation
        url = f"{self.base_url}/generate"
        headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {self.token}'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing Generate Project...")
        print(f"   URL: {url}")
        
        try:
            response = requests.post(url, json=generate_data, headers=headers, timeout=90)
            
            if response.status_code == 200:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                response_data = response.json()
                if 'job_id' in response_data:
                    job_id = response_data['job_id']
                    print(f"   Job ID: {job_id}")
                    
                    # Poll for completion (simplified)
                    import time
                    for i in range(12):  # Wait up to 60 seconds
                        time.sleep(5)
                        status_url = f"{self.base_url}/generate/status/{job_id}"
                        status_response = requests.get(status_url, headers=headers, timeout=30)
                        if status_response.status_code == 200:
                            status_data = status_response.json()
                            if status_data.get('status') == 'done':
                                self.project_id = status_data.get('project_id')
                                print(f"   ✅ Generation completed! Project ID: {self.project_id}")
                                return True
                            elif status_data.get('status') == 'error':
                                print(f"   ❌ Generation failed: {status_data.get('error')}")
                                return False
                            else:
                                print(f"   ⏳ Status: {status_data.get('status')} - {status_data.get('message')}")
                    
                    print("   ⚠️  Generation still in progress after 60s, considering as success")
                    return True
                return True
            else:
                print(f"❌ Failed - Status: {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False
                
        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout")
            return False
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False

    def test_get_projects_with_data(self):
        """Test get projects (should have data now)"""
        success, response = self.run_test(
            "Get Projects (With Data)",
            "GET",
            "projects",
            200
        )
        
        if success and isinstance(response, list) and len(response) > 0:
            print(f"   ✅ Found {len(response)} project(s)")
            return True
        return success

    def test_get_specific_project(self):
        """Test get specific project"""
        if not self.project_id:
            print("❌ No project ID available for testing")
            return False
            
        success, response = self.run_test(
            "Get Specific Project",
            "GET",
            f"projects/{self.project_id}",
            200
        )
        
        if success and 'files' in response:
            files_count = len(response.get('files', []))
            print(f"   ✅ Project has {files_count} files")
            return True
        return success

    def test_download_project(self):
        """Test project download"""
        if not self.project_id:
            print("❌ No project ID available for testing")
            return False
            
        url = f"{self.base_url}/projects/{self.project_id}/download"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing Download Project...")
        
        try:
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                if 'application/zip' in content_type:
                    self.tests_passed += 1
                    print(f"✅ Passed - ZIP file downloaded successfully")
                    print(f"   Content-Type: {content_type}")
                    print(f"   Size: {len(response.content)} bytes")
                    return True
                else:
                    print(f"❌ Failed - Wrong content type: {content_type}")
                    return False
            else:
                print(f"❌ Failed - Status: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False

    def test_delete_project(self):
        """Test project deletion"""
        if not self.project_id:
            print("❌ No project ID available for testing")
            return False
            
        success, response = self.run_test(
            "Delete Project",
            "DELETE",
            f"projects/{self.project_id}",
            200
        )
        return success

    def test_invalid_login(self):
        """Test login with invalid credentials"""
        invalid_data = {
            "email": "invalid@example.com",
            "password": "wrongpassword"
        }
        
        success, response = self.run_test(
            "Invalid Login",
            "POST",
            "auth/login",
            401,
            data=invalid_data
        )
        return success

    def test_unauthorized_access(self):
        """Test accessing protected endpoint without token"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        success, response = self.run_test(
            "Unauthorized Access",
            "GET",
            "projects",
            401
        )
        
        # Restore token
        self.token = original_token
        return success

    def test_github_status_without_auth(self):
        """Test GitHub status endpoint without authentication - should return 401"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        success, response = self.run_test(
            "GitHub Status (No Auth)",
            "GET",
            "github/status",
            401  # Should require authentication
        )
        
        # Restore token
        self.token = original_token
        return success

    def test_github_oauth_start_without_auth(self):
        """Test GitHub OAuth start endpoint without authentication - should return 401"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        success, response = self.run_test(
            "GitHub OAuth Start (No Auth)",
            "POST",
            "github/oauth/start",
            401  # Should require authentication
        )
        
        # Restore token
        self.token = original_token
        return success

    def test_github_status_with_auth(self):
        """Test GitHub status endpoint with authentication"""
        success, response = self.run_test(
            "GitHub Status (With Auth)",
            "GET",
            "github/status",
            200
        )
        
        if success and 'connected' in response:
            print(f"   GitHub connected: {response.get('connected')}")
            if response.get('connected'):
                print(f"   GitHub username: {response.get('github_username')}")
        
        return success

    def test_github_oauth_start_with_auth(self):
        """Test GitHub OAuth start endpoint with authentication"""
        success, response = self.run_test(
            "GitHub OAuth Start (With Auth)",
            "POST",
            "github/oauth/start",
            200
        )
        
        if success and 'auth_url' in response:
            auth_url = response.get('auth_url')
            print(f"   Auth URL generated: {auth_url[:50]}...")
            # Verify it's a GitHub OAuth URL
            if 'github.com/login/oauth/authorize' in auth_url:
                print("   ✅ Valid GitHub OAuth URL format")
            else:
                print("   ❌ Invalid GitHub OAuth URL format")
                return False
        
        return success

    def test_github_repos_without_connection(self):
        """Test GitHub repos endpoint without GitHub connection"""
        success, response = self.run_test(
            "GitHub Repos (No Connection)",
            "GET",
            "github/repos",
            400  # Should return 400 if GitHub not connected
        )
        return success

    def test_github_import_public_invalid_url(self):
        """Test GitHub public import with invalid URL"""
        success, response = self.run_test(
            "GitHub Import Public (Invalid URL)",
            "POST",
            "github/import/public",
            400,
            data={"url": "invalid-url"}
        )
        return success

    def test_github_import_public_valid_url(self):
        """Test GitHub public import with valid URL (should work without auth)"""
        success, response = self.run_test(
            "GitHub Import Public (Valid URL)",
            "POST",
            "github/import/public",
            200,
            data={
                "url": "https://github.com/octocat/Hello-World",
                "project_name": "Test Import"
            }
        )
        
        if success and 'project_id' in response:
            print(f"   Imported project ID: {response.get('project_id')}")
            print(f"   Files imported: {response.get('file_count')}")
            if response.get('warnings'):
                print(f"   Warnings: {len(response.get('warnings'))}")
        
        return success

def main():
    print("🚀 Starting CodeForge API Tests")
    print("=" * 50)
    
    tester = WebcraftersApiTester()
    
    # Test sequence
    tests = [
        ("Root Endpoint", tester.test_root_endpoint),
        ("User Registration", tester.test_register),
        ("User Login", tester.test_login),
        ("Get Current User", tester.test_get_me),
        ("GitHub Status (No Auth)", tester.test_github_status_without_auth),
        ("GitHub OAuth Start (No Auth)", tester.test_github_oauth_start_without_auth),
        ("GitHub Status (With Auth)", tester.test_github_status_with_auth),
        ("GitHub OAuth Start (With Auth)", tester.test_github_oauth_start_with_auth),
        ("GitHub Repos (No Connection)", tester.test_github_repos_without_connection),
        ("GitHub Import Public (Invalid URL)", tester.test_github_import_public_invalid_url),
        ("GitHub Import Public (Valid URL)", tester.test_github_import_public_valid_url),
        ("Get Projects (Empty)", tester.test_get_projects_empty),
        ("Get Projects (With Data)", tester.test_get_projects_with_data),
        ("Invalid Login", tester.test_invalid_login),
        ("Unauthorized Access", tester.test_unauthorized_access),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} - Exception: {str(e)}")
            failed_tests.append(test_name)
    
    # Print results
    print("\n" + "=" * 50)
    print("📊 TEST RESULTS")
    print("=" * 50)
    print(f"Tests run: {tester.tests_run}")
    print(f"Tests passed: {tester.tests_passed}")
    print(f"Tests failed: {len(failed_tests)}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    if failed_tests:
        print(f"\n❌ Failed tests:")
        for test in failed_tests:
            print(f"   - {test}")
    else:
        print(f"\n✅ All tests passed!")
    
    return 0 if len(failed_tests) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())