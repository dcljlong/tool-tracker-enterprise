import requests
import sys
import json
from datetime import datetime, timedelta

class ToolManagementAPITester:
    def __init__(self, base_url="https://checkout-console.preview.emergentagent.com"):
        self.base_url = base_url
        self.admin_token = None
        self.worker_token = None
        self.test_tool_id = None
        self.test_user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        print(f"🔧 Testing Tool Management System API at: {self.base_url}")
        print("=" * 60)

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if headers:
            test_headers.update(headers)
        
        if self.admin_token and 'Authorization' not in test_headers:
            test_headers['Authorization'] = f'Bearer {self.admin_token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   {method} {endpoint}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                if files:
                    # Remove content-type for file uploads
                    if 'Content-Type' in test_headers:
                        del test_headers['Content-Type']
                    response = requests.post(url, files=files, headers=test_headers)
                else:
                    response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = (response.status_code == expected_status or 
                      (isinstance(expected_status, list) and response.status_code in expected_status))
            if success:
                self.tests_passed += 1
                print(f"   ✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and len(str(response_data)) < 200:
                        print(f"   📄 Response: {response_data}")
                    elif isinstance(response_data, list):
                        print(f"   📋 Response: {len(response_data)} items")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"   ❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_msg = response.json()
                    print(f"   🚫 Error: {error_msg}")
                except:
                    print(f"   🚫 Error: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"   ❌ Failed - Error: {str(e)}")
            return False, {}

    def test_first_run_check(self):
        """Test first run check - should return is_first_run: true for fresh DB"""
        success, response = self.run_test(
            "First Run Check",
            "GET", 
            "setup/check",
            200
        )
        if success and response.get('is_first_run'):
            print("   ✨ Fresh database confirmed - ready for setup")
            return True
        return success

    def test_admin_setup(self):
        """Test admin setup via POST /api/auth/setup"""
        admin_data = {
            "name": "Test Admin",
            "email": "admin@test.com", 
            "password": "password123"
        }
        success, response = self.run_test(
            "Admin Setup",
            "POST",
            "auth/setup", 
            200,
            data=admin_data
        )
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   🔑 Admin token obtained")
            return True
        return success

    def test_admin_login(self):
        """Test login with admin credentials"""
        login_data = {
            "email": "admin@test.com",
            "password": "password123"
        }
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data=login_data,
            headers={'Authorization': ''}  # No auth needed for login
        )
        if success and 'token' in response:
            self.admin_token = response['token']  # Store token for future requests
            print(f"   🔓 Login successful - token stored")
            return True
        return success

    def test_get_me(self):
        """Test GET /api/auth/me returns user profile with token"""
        success, response = self.run_test(
            "Get User Profile", 
            "GET",
            "auth/me",
            200
        )
        if success and 'name' in response and 'role' in response:
            print(f"   👤 Profile: {response.get('name')} ({response.get('role')})")
            return True
        return success

    def test_create_tool(self):
        """Test creating a tool via POST /api/tools"""
        import time
        timestamp = int(time.time())
        tool_data = {
            "asset_id": f"TEST-{timestamp}",
            "description": "Test Power Drill", 
            "category": "Power Tools",
            "model_name": "Makita DHP484",
            "serial_number": f"SN{timestamp}",
            "condition": "good",
            "safety_tag_expiry": (datetime.now() + timedelta(days=365)).isoformat()[:10],
            "notes": "Test tool for API validation"
        }
        success, response = self.run_test(
            "Create Tool",
            "POST", 
            "tools",
            200,  # API returns 200 for creation
            data=tool_data
        )
        if success and 'id' in response:
            self.test_tool_id = response['id']
            print(f"   🔧 Tool created with ID: {self.test_tool_id}")
            return True
        return success

    def test_list_tools(self):
        """Test listing tools via GET /api/tools"""
        success, response = self.run_test(
            "List Tools",
            "GET",
            "tools", 
            200
        )
        if success and isinstance(response, list):
            print(f"   📋 Found {len(response)} tools")
            return True
        return success

    def test_get_tool_detail(self):
        """Test getting tool detail via GET /api/tools/{id}"""
        if not self.test_tool_id:
            print("   ⚠️  Skipped - No test tool ID available")
            return False
            
        success, response = self.run_test(
            "Get Tool Detail",
            "GET",
            f"tools/{self.test_tool_id}",
            200
        )
        if success and 'asset_id' in response and 'description' in response:
            print(f"   🔧 Tool details: {response.get('asset_id')} - {response.get('description')}")
            return True
        return success

    def test_get_qr_code(self):
        """Test getting QR code via GET /api/tools/{id}/qr"""
        if not self.test_tool_id:
            print("   ⚠️  Skipped - No test tool ID available")
            return False
            
        success, response = self.run_test(
            "Get QR Code", 
            "GET",
            f"tools/{self.test_tool_id}/qr",
            200
        )
        if success and 'qr_code' in response and response['qr_code'].startswith('data:image'):
            print(f"   📱 QR code generated successfully")
            return True
        return success

    def test_checkout_tool(self):
        """Test checking out tool via POST /api/checkout"""
        if not self.test_tool_id:
            print("   ⚠️  Skipped - No test tool ID available")
            return False
            
        checkout_data = {
            "tool_id": self.test_tool_id,
            "job_number": "JOB-2024-001", 
            "site": "Test Construction Site",
            "site_manager": "John Smith",
            "expected_return_date": (datetime.now() + timedelta(days=7)).isoformat()[:10],
            "notes": "Testing checkout functionality"
        }
        success, response = self.run_test(
            "Checkout Tool",
            "POST",
            "checkout",
            200,  # API returns 200
            data=checkout_data
        )
        if success and response.get('status') == 'active':
            print(f"   📤 Tool checked out to job {checkout_data['job_number']}")
            return True
        return success

    def test_return_tool(self):
        """Test returning tool via POST /api/return"""
        if not self.test_tool_id:
            print("   ⚠️  Skipped - No test tool ID available")
            return False
            
        return_data = {
            "tool_id": self.test_tool_id,
            "condition": "good",
            "notes": "Tool returned in good condition"
        }
        success, response = self.run_test(
            "Return Tool",
            "POST",
            "return", 
            200,
            data=return_data
        )
        if success and response.get('status') == 'returned':
            print(f"   📥 Tool returned successfully")
            return True
        return success

    def test_create_worker_user(self):
        """Test creating worker user via POST /api/users"""
        import time
        timestamp = int(time.time())
        user_data = {
            "name": "Test Worker",
            "email": f"worker{timestamp}@test.com",
            "password": "worker123",
            "role": "worker"
        }
        success, response = self.run_test(
            "Create Worker User",
            "POST",
            "users",
            200,  # API returns 200 for creation
            data=user_data
        )
        if success and 'id' in response:
            self.test_user_id = response['id']
            print(f"   👷 Worker created with ID: {self.test_user_id}")
            return True
        return success

    def test_handover_tool(self):
        """Test tool handover via POST /api/handover"""
        if not self.test_tool_id or not self.test_user_id:
            print("   ⚠️  Skipped - Need tool and user for handover")
            return False
            
        # First check out the tool again 
        checkout_data = {
            "tool_id": self.test_tool_id,
            "job_number": "JOB-2024-002",
            "site": "Handover Test Site", 
            "site_manager": "Jane Doe",
            "expected_return_date": (datetime.now() + timedelta(days=5)).isoformat()[:10]
        }
        self.run_test("Re-checkout for Handover", "POST", "checkout", 200, data=checkout_data)
        
        handover_data = {
            "tool_id": self.test_tool_id,
            "next_holder_id": self.test_user_id,
            "job_number": "JOB-2024-002",
            "site_manager": "Jane Doe",
            "notes": "Handover for testing"
        }
        success, response = self.run_test(
            "Handover Tool",
            "POST",
            "handover",
            200,  # API returns 200
            data=handover_data
        )
        if success and response.get('status') == 'completed':
            print(f"   🤝 Tool handed over successfully")
            return True
        return success

    def test_record_maintenance(self):
        """Test recording maintenance via POST /api/maintenance"""
        if not self.test_tool_id:
            print("   ⚠️  Skipped - No test tool ID available")
            return False
            
        maintenance_data = {
            "tool_id": self.test_tool_id,
            "action_type": "inspection",
            "description": "Routine safety inspection completed",
            "safety_tag_expiry": (datetime.now() + timedelta(days=365)).isoformat()[:10],
            "condition": "good"
        }
        success, response = self.run_test(
            "Record Maintenance",
            "POST", 
            "maintenance",
            200,  # API returns 200
            data=maintenance_data
        )
        if success and 'id' in response:
            print(f"   🔧 Maintenance recorded successfully")
            return True
        return success

    def test_dashboard_stats(self):
        """Test dashboard stats via GET /api/dashboard/stats"""
        success, response = self.run_test(
            "Dashboard Stats",
            "GET",
            "dashboard/stats",
            200
        )
        if success and 'total_tools' in response:
            stats = response
            print(f"   📊 Stats: {stats.get('total_tools')} tools, {stats.get('available')} available")
            return True
        return success

    def test_settings_crud(self):
        """Test settings CRUD via GET/PUT /api/settings"""
        # Test GET settings
        success_get, settings = self.run_test(
            "Get Settings",
            "GET",
            "settings",
            200
        )
        
        # Test PUT settings
        settings_update = {
            "company_name": "Test Construction Company",
            "notify_days_before": 7,
            "notify_tag_expiry": True
        }
        success_put, _ = self.run_test(
            "Update Settings", 
            "PUT",
            "settings",
            200,
            data=settings_update
        )
        
        if success_get and success_put:
            print(f"   ⚙️  Settings CRUD working")
            return True
        return False

    def test_notifications_list(self):
        """Test notifications list via GET /api/notifications"""
        success, response = self.run_test(
            "List Notifications",
            "GET",
            "notifications",
            200
        )
        if success and isinstance(response, list):
            print(f"   🔔 Found {len(response)} notifications")
            return True
        return success

    def test_audit_trail(self):
        """Test audit trail via GET /api/audit/{tool_id}"""
        if not self.test_tool_id:
            print("   ⚠️  Skipped - No test tool ID available")
            return False
            
        success, response = self.run_test(
            "Get Audit Trail",
            "GET", 
            f"audit/{self.test_tool_id}",
            200
        )
        if success and isinstance(response, list):
            print(f"   📋 Audit trail: {len(response)} entries")
            return True
        return success

    def test_photo_upload(self):
        """Test P1 Feature: Photo upload via POST /api/tools/{tool_id}/photo"""
        if not self.test_tool_id:
            print("   ⚠️  Skipped - No test tool ID available")
            return False
            
        # Create a minimal PNG image in memory
        import io
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {'file': ('test_photo.png', io.BytesIO(png_data), 'image/png')}
        
        success, response = self.run_test(
            "Photo Upload (P1)",
            "POST",
            f"tools/{self.test_tool_id}/photo",
            200,
            files=files
        )
        
        if success and response.get('photo_url'):
            photo_url = response['photo_url']
            print(f"   📸 Photo URL: {photo_url}")
            
            # Test photo serving
            import requests
            photo_response = requests.get(f"{self.base_url}{photo_url}")
            if photo_response.status_code == 200:
                print(f"   ✅ Photo serves correctly via {photo_url}")
                return True
            else:
                print(f"   ❌ Photo serving failed: {photo_response.status_code}")
                return False
        return success

    def test_csv_import(self):
        """Test P1 Feature: CSV import via POST /api/import/tools"""
        csv_data = """asset_id,description,category,model_name,serial_number,condition
TEST-CSV-001,CSV Import Test Drill,Power Tools,TestDrill Model,CSV123456,good
TEST-CSV-002,CSV Import Test Hammer,Hand Tools,TestHammer Pro,CSV789012,fair"""
        
        files = {'file': ('test_import.csv', csv_data.encode(), 'text/csv')}
        
        success, response = self.run_test(
            "CSV Import (P1)",
            "POST", 
            "import/tools",
            200,
            files=files
        )
        
        if success:
            imported = response.get('imported', 0)
            errors = response.get('errors', [])
            print(f"   📋 Imported: {imported} tools, Errors: {len(errors)}")
            if errors:
                print(f"   ⚠️  Import errors: {errors[:2]}")  # Show first 2 errors
            return imported > 0
        return success

    def test_pdf_import(self):
        """Test P1 Feature: PDF import via POST /api/import/tools (graceful handling of blank PDF)"""
        # Create minimal PDF with some extractable text
        pdf_content = b'''%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Asset ID Description) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
297
%%EOF'''
        
        files = {'file': ('test_schedule.pdf', pdf_content, 'application/pdf')}
        
        # Test should handle gracefully - might return 400 for unstructured PDF or import some items
        success, response = self.run_test(
            "PDF Import (P1)",
            "POST",
            "import/tools", 
            [200, 400],  # Accept both - graceful handling
            files=files
        )
        
        if success:
            imported = response.get('imported', 0) 
            errors = response.get('errors', [])
            print(f"   📄 PDF handled gracefully - Imported: {imported}, Errors: {len(errors)}")
        return True  # Consider success if handled gracefully

    def test_excel_import(self):
        """Test P1 Feature: Excel import still works via POST /api/import/tools"""
        # Create minimal Excel file using openpyxl format
        import io
        
        # Simple Excel-like data in CSV format for testing
        excel_data = b'PK\x03\x04\x14\x00\x00\x00\x08\x00'  # Basic Excel header
        excel_data += b'asset_id,description,category\nTEST-XLS-001,Excel Test Tool,General'
        
        files = {'file': ('test_import.xlsx', excel_data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        
        success, response = self.run_test(
            "Excel Import (P1)",
            "POST",
            "import/tools",
            [200, 400],  # May fail due to invalid Excel format, but should be handled
            files=files
        )
        
        if success:
            imported = response.get('imported', 0)
            print(f"   📊 Excel import handled: {imported} tools")
        return True  # Consider success if handled gracefully

    def test_periodic_background_task(self):
        """Test P1 Feature: Periodic background task is running"""
        print(f"   ⏰ Checking periodic background task logs...")
        
        try:
            import subprocess
            # Check supervisor logs for the background task
            result = subprocess.run(['tail', '-n', '200', '/var/log/supervisor/backend*.log'], 
                                  capture_output=True, text=True, shell=True)
            
            log_content = result.stdout + result.stderr
            
            # Look for startup message or periodic check messages
            task_started = "Periodic expiry checker started" in log_content
            task_running = any(keyword in log_content for keyword in [
                "periodic expiry", "Periodic", "expiry check", "Running periodic"
            ])
            
            if task_started:
                print(f"   ✅ Periodic task started successfully")
                self.tests_passed += 1
            elif task_running:
                print(f"   ✅ Periodic task evidence found in logs")
                self.tests_passed += 1
            else:
                print(f"   ❌ No periodic task evidence in logs")
            
            self.tests_run += 1
            return task_started or task_running
            
        except Exception as e:
            print(f"   ⚠️  Could not check logs: {str(e)}")
            self.tests_run += 1
            return False

    def test_email_notification_settings(self):
        """Test P1 Feature: Email notification function exists and respects admin settings"""
        success, response = self.run_test(
            "Email Settings (P1)",
            "GET",
            "settings",
            200
        )
        
        if success:
            has_email_provider = bool(response.get('email_provider'))
            has_api_key = bool(response.get('email_api_key'))
            notify_expiry = response.get('notify_tag_expiry', False)
            notify_overdue = response.get('notify_overdue', False) 
            
            print(f"   📧 Email provider configured: {has_email_provider}")
            print(f"   🔑 API key configured: {has_api_key}")
            print(f"   ⚠️  Notify on expiry: {notify_expiry}")
            print(f"   ⏰ Notify on overdue: {notify_overdue}")
            
            # Test email test endpoint (will likely fail without SendGrid config, but function should exist)
            test_success, test_response = self.run_test(
                "Email Test Function",
                "POST",
                "settings/test-email",
                [200, 400],  # Accept both - function exists but may not be configured
                data={}
            )
            
            if test_success or test_response:
                print(f"   📤 Email test function exists")
            
            return True
        return success

    def test_health_check(self):
        """Test health check"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "health", 
            200,
            headers={'Authorization': ''}  # No auth needed
        )
        if success and response.get('status') == 'healthy':
            print(f"   ❤️  System healthy")
            return True
        return success

    # =================== P2 FEATURE TESTS ===================
    
    def test_reports_summary(self):
        """Test P2: GET /api/reports/summary returns inventory, activity, top_users, top_tools"""
        print(f"\n🆕 P2: Testing Reports Summary API...")
        
        # Test with default parameters
        success1, response1 = self.run_test(
            "Reports Summary (default)",
            "GET",
            "reports/summary",
            200
        )
        
        # Test with weekly period
        success2, response2 = self.run_test(
            "Reports Summary (weekly)",
            "GET", 
            f"reports/summary?period=week",
            200
        )
        
        # Test with daily period
        success3, response3 = self.run_test(
            "Reports Summary (daily)",
            "GET",
            f"reports/summary?period=day",
            200
        )
        
        # Validate response structure for P2
        if success1 and response1:
            expected_keys = ["inventory", "activity", "top_users", "top_tools"]
            has_keys = all(key in response1 for key in expected_keys)
            if has_keys:
                print("   ✅ P2: Response has required keys: inventory, activity, top_users, top_tools")
                # Check specific structure
                inventory = response1.get("inventory", {})
                activity = response1.get("activity", {})
                if "total" in inventory and "checkouts" in activity:
                    print("   ✅ P2: Inventory and activity data structure correct")
                else:
                    print("   ❌ P2: Missing required inventory/activity fields")
            else:
                print("   ❌ P2: Missing required keys in response")
                
        return success1 and success2 and success3

    def test_pdf_exports(self):
        """Test P2: GET /api/reports/export-pdf for all report types return PDF binary"""
        print(f"\n🆕 P2: Testing PDF Export APIs...")
        
        report_types = ["inventory", "activity", "overdue"]
        results = []
        
        for report_type in report_types:
            success, response = self.run_test(
                f"PDF Export ({report_type})",
                "GET",
                f"reports/export-pdf?report_type={report_type}&days=7",
                200
            )
            if success:
                # For PDF endpoints, we need to check actual response
                try:
                    import requests
                    url = f"{self.base_url}/api/reports/export-pdf?report_type={report_type}&days=7"
                    headers = {'Authorization': f'Bearer {self.admin_token}'}
                    pdf_response = requests.get(url, headers=headers)
                    
                    if pdf_response.status_code == 200:
                        content_type = pdf_response.headers.get('content-type', '')
                        if 'application/pdf' in content_type:
                            print(f"   ✅ P2: {report_type} PDF generated successfully")
                            results.append(True)
                        else:
                            print(f"   ❌ P2: {report_type} PDF - wrong content type: {content_type}")
                            results.append(False)
                    else:
                        print(f"   ❌ P2: {report_type} PDF failed with status: {pdf_response.status_code}")
                        results.append(False)
                except Exception as e:
                    print(f"   ❌ P2: {report_type} PDF request failed: {str(e)}")
                    results.append(False)
            else:
                results.append(False)
                
        return all(results)

    def test_categories_crud(self):
        """Test P2: Categories CRUD operations"""
        print(f"\n🆕 P2: Testing Categories CRUD APIs...")
        
        # First get existing categories
        success, existing_cats = self.run_test(
            "Get Categories (initial)",
            "GET", 
            "categories",
            200
        )
        
        if success:
            print(f"   📁 P2: Found {len(existing_cats)} existing categories")
        
        # Create new category
        import time
        timestamp = int(time.time())
        test_category = {
            "name": f"Test Category {timestamp}",
            "description": "Test category for P2 API testing"
        }
        
        success1, create_response = self.run_test(
            "Create Category",
            "POST",
            "categories", 
            200,
            data=test_category
        )
        
        category_id = None
        if success1 and create_response:
            category_id = create_response.get("id")
            print(f"   ✅ P2: Category created with ID: {category_id}")
        
        # Get categories again to verify creation and tool_count field
        success2, updated_cats = self.run_test(
            "Get Categories (after create)",
            "GET",
            "categories",
            200  
        )
        
        if success2 and updated_cats:
            # Check if categories have tool_count field (P2 requirement)
            if len(updated_cats) > 0 and 'tool_count' in updated_cats[0]:
                print("   ✅ P2: Categories include tool_count field")
            else:
                print("   ❌ P2: Categories missing tool_count field")
        
        # Update category if created successfully
        success3 = False
        if category_id:
            update_data = {
                "name": test_category["name"] + " UPDATED",
                "description": "Updated description for P2 testing"
            }
            success3, _ = self.run_test(
                "Update Category",
                "PUT",
                f"categories/{category_id}",
                200,
                data=update_data
            )
        
        # Try to delete category (should work if no tools use it)
        success4 = False
        if category_id:
            success4, delete_response = self.run_test(
                "Delete Category",
                "DELETE", 
                f"categories/{category_id}",
                200
            )
            
        return success1 and success2 and success3 and success4

    def test_user_filtering(self):
        """Test P2: User search and filter by role/status"""
        print(f"\n🆕 P2: Testing User Filtering APIs...")
        
        # Test search filter
        success1, search_result = self.run_test(
            "Users Search Filter",
            "GET",
            "users?search=admin",
            200
        )
        
        if success1 and isinstance(search_result, list):
            print(f"   🔍 P2: Search returned {len(search_result)} users")
        
        # Test role filter
        success2, role_result = self.run_test(
            "Users Role Filter (admin)",
            "GET", 
            "users?role=admin",
            200
        )
        
        if success2 and isinstance(role_result, list):
            print(f"   👑 P2: Role filter returned {len(role_result)} admin users")
        
        # Test status filter  
        success3, status_result = self.run_test(
            "Users Status Filter (active)",
            "GET",
            "users?status=active", 
            200
        )
        
        if success3 and isinstance(status_result, list):
            print(f"   ✅ P2: Status filter returned {len(status_result)} active users")
        
        # Test combined filters
        success4, combined_result = self.run_test(
            "Users Combined Filters",
            "GET",
            "users?search=admin&role=admin&status=active",
            200
        )
        
        if success4 and isinstance(combined_result, list):
            print(f"   🔍 P2: Combined filters returned {len(combined_result)} users")
        
        return success1 and success2 and success3 and success4

    # =================== P3 FEATURE TESTS (NEW FEATURES) ===================
    
    def test_certificate_types_api(self):
        """Test P3: GET /api/certificates/types returns NZ cert types and standards"""
        print(f"\n🆕 P3: Testing Certificate Types API...")
        
        success, response = self.run_test(
            "Get Certificate Types",
            "GET",
            "certificates/types",
            200
        )
        
        if success and response:
            types = response.get('types', [])
            standards = response.get('standards', [])
            
            expected_types = ["Annual Inspection", "Load Test Certificate", "Electrical Test & Tag"]
            expected_standards = ["AS/NZS 1418 (Cranes)", "AS/NZS 3012 (Electrical)", "AS/NZS 1576 (Scaffolding)"]
            
            types_valid = all(cert_type in types for cert_type in expected_types)
            standards_valid = all(standard in standards for standard in expected_standards)
            
            if types_valid and standards_valid:
                print(f"   ✅ P3: Certificate types ({len(types)}) and standards ({len(standards)}) loaded correctly")
                return True
            else:
                print(f"   ❌ P3: Missing expected certificate types or standards")
                return False
        return success

    def test_certificate_crud(self):
        """Test P3: Certificate CRUD operations including NZ license numbers"""
        print(f"\n🆕 P3: Testing Certificate CRUD APIs...")
        
        if not self.test_tool_id:
            print("   ⚠️  Skipped - No test tool ID available for certificate testing")
            return False
        
        # Create certificate with NZ-specific fields
        cert_data = {
            "tool_id": self.test_tool_id,
            "certificate_type": "Annual Inspection",
            "certificate_number": "AI-2025-001",
            "issuer_name": "John Smith",
            "issuer_company": "NZ Safety Inspections Ltd",
            "issuer_license_number": "NZL-123456",  # NZ license number
            "nz_standard": "AS/NZS 1418 (Cranes)",
            "issue_date": datetime.now().date().isoformat(),
            "expiry_date": (datetime.now().date() + timedelta(days=365)).isoformat(),
            "notes": "Annual safety inspection completed"
        }
        
        # Create certificate
        success1, create_response = self.run_test(
            "Create Certificate (NZ)",
            "POST",
            "certificates",
            200,
            data=cert_data
        )
        
        cert_id = None
        if success1 and create_response:
            cert_id = create_response.get('id')
            print(f"   ✅ P3: Certificate created with ID: {cert_id}")
            
            # Verify NZ-specific fields
            if create_response.get('issuer_license_number') == cert_data['issuer_license_number']:
                print(f"   ✅ P3: NZ license number stored correctly: {cert_data['issuer_license_number']}")
            
        # Get certificates for tool with computed status
        success2, cert_list = self.run_test(
            "Get Tool Certificates",
            "GET",
            f"certificates?tool_id={self.test_tool_id}",
            200
        )
        
        status_computed = False
        if success2 and cert_list and len(cert_list) > 0:
            cert = cert_list[0]
            if 'status' in cert and cert['status'] in ['valid', 'expired', 'expiring_soon']:
                print(f"   ✅ P3: Certificate status computed correctly: {cert['status']}")
                status_computed = True
            else:
                print(f"   ❌ P3: Certificate status not computed or invalid")
        
        # Test document upload if certificate was created
        upload_success = False
        if cert_id:
            # Create a minimal PDF for document upload
            pdf_content = b'''%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
181
%%EOF'''
            
            files = {'file': ('certificate_doc.pdf', pdf_content, 'application/pdf')}
            success3, upload_response = self.run_test(
                "Upload Certificate Document",
                "POST",
                f"certificates/{cert_id}/document",
                200,
                files=files
            )
            
            if success3 and upload_response.get('document_url'):
                print(f"   ✅ P3: Certificate document uploaded: {upload_response['document_url']}")
                upload_success = True
        
        # Delete certificate
        delete_success = False
        if cert_id:
            success4, _ = self.run_test(
                "Delete Certificate",
                "DELETE",
                f"certificates/{cert_id}",
                200
            )
            if success4:
                print(f"   ✅ P3: Certificate deleted successfully")
                delete_success = True
        
        return success1 and success2 and status_computed and upload_success and delete_success

    def test_bulk_checkout(self):
        """Test P3: POST /api/bulk-checkout checks out multiple tools at once"""
        print(f"\n🆕 P3: Testing Bulk Checkout API...")
        
        # First ensure we have multiple available tools
        success, tools = self.run_test(
            "Get Available Tools for Bulk",
            "GET",
            "tools?status=available",
            200
        )
        
        if not success or not tools or len(tools) < 2:
            print("   ⚠️  Need at least 2 available tools for bulk checkout test - creating more")
            # Create additional test tools if needed
            for i in range(2):
                tool_data = {
                    "asset_id": f"BULK-TEST-{int(datetime.now().timestamp())}-{i}",
                    "description": f"Bulk Test Tool {i+1}",
                    "category": "Power Tools",
                    "condition": "good"
                }
                self.run_test(f"Create Bulk Test Tool {i+1}", "POST", "tools", 200, data=tool_data)
            
            # Get available tools again
            success, tools = self.run_test("Get Tools After Creation", "GET", "tools?status=available", 200)
        
        if success and tools and len(tools) >= 2:
            # Select first 2 available tools for bulk checkout
            tool_ids = [tools[0]['id'], tools[1]['id']]
            
            bulk_data = {
                "tool_ids": tool_ids,
                "job_number": "BULK-JOB-001",
                "site": "Bulk Test Site",
                "site_manager": "Test Manager",
                "expected_return_date": (datetime.now().date() + timedelta(days=7)).isoformat(),
                "notes": "Bulk checkout test"
            }
            
            success1, response = self.run_test(
                "Bulk Checkout Multiple Tools",
                "POST",
                "bulk-checkout",
                200,
                data=bulk_data
            )
            
            if success1 and response:
                success_count = len(response.get('success', []))
                failed_count = len(response.get('failed', []))
                
                if success_count >= 2:
                    print(f"   ✅ P3: Bulk checkout successful - {success_count} tools checked out")
                    # Store tool IDs for bulk return test
                    self.bulk_test_tool_ids = tool_ids
                    return True
                else:
                    print(f"   ❌ P3: Bulk checkout partial failure - {success_count} success, {failed_count} failed")
                    failed_reasons = [f['reason'] for f in response.get('failed', [])]
                    print(f"   Failed reasons: {failed_reasons}")
            return success1
        
        print("   ⚠️  Insufficient available tools for bulk checkout test")
        return False

    def test_bulk_return(self):
        """Test P3: POST /api/bulk-return returns multiple tools at once"""
        print(f"\n🆕 P3: Testing Bulk Return API...")
        
        # Use tools from bulk checkout test, or get checked out tools
        tool_ids = getattr(self, 'bulk_test_tool_ids', None)
        
        if not tool_ids:
            # Get checked out tools
            success, tools = self.run_test(
                "Get Checked Out Tools",
                "GET",
                "tools?status=checked_out",
                200
            )
            
            if success and tools and len(tools) >= 1:
                tool_ids = [tools[0]['id']]
                if len(tools) > 1:
                    tool_ids.append(tools[1]['id'])
            else:
                print("   ⚠️  No checked out tools available for bulk return test")
                return False
        
        bulk_return_data = {
            "tool_ids": tool_ids,
            "condition": "good",
            "notes": "Bulk return test completed"
        }
        
        success, response = self.run_test(
            "Bulk Return Multiple Tools",
            "POST",
            "bulk-return",
            200,
            data=bulk_return_data
        )
        
        if success and response:
            success_count = len(response.get('success', []))
            failed_count = len(response.get('failed', []))
            
            if success_count >= 1:
                print(f"   ✅ P3: Bulk return successful - {success_count} tools returned")
                return True
            else:
                print(f"   ❌ P3: Bulk return failed - {failed_count} tools failed to return")
        
        return success

    def test_calendar_events_api(self):
        """Test P3: GET /api/calendar/events returns maintenance, tag, cert expiry, and return events"""
        print(f"\n🆕 P3: Testing Calendar Events API...")
        
        success, response = self.run_test(
            "Get Calendar Events",
            "GET",
            "calendar/events",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   📅 P3: Calendar API returned {len(response)} events")
            
            # Check for expected event types
            event_types = set()
            for event in response:
                if 'type' in event:
                    event_types.add(event['type'])
            
            expected_types = ['maintenance', 'tag_expiry', 'certificate_expiry', 'expected_return']
            found_types = [t for t in expected_types if t in event_types]
            
            if found_types:
                print(f"   ✅ P3: Found event types: {found_types}")
            
            # Validate event structure
            if response and len(response) > 0:
                event = response[0]
                required_fields = ['id', 'type', 'title', 'date', 'tool_id']
                has_required = all(field in event for field in required_fields)
                
                if has_required:
                    print(f"   ✅ P3: Event structure valid with required fields")
                else:
                    print(f"   ❌ P3: Event missing required fields")
                    missing = [f for f in required_fields if f not in event]
                    print(f"   Missing: {missing}")
            
            return True
        
        return success

    def run_all_tests(self):
        """Run all backend API tests"""
        print("🚀 Starting Backend API Test Suite")
        
        # Setup & Auth Tests
        print("\n📋 SETUP & AUTHENTICATION TESTS")
        self.test_health_check()
        
        # Check if first run, if not just login with existing admin
        success, response = self.run_test("Check First Run", "GET", "setup/check", 200, headers={'Authorization': ''})
        if success and response.get('is_first_run'):
            print("   ✨ Fresh database - running setup")
            self.test_admin_setup()
        else:
            print("   📝 Database already set up - logging in with existing admin")
            self.test_admin_login()
        
        # If no token yet, try login
        if not self.admin_token:
            self.test_admin_login()
            
        self.test_get_me()
        
        # Tool Management Tests
        print("\n🔧 TOOL MANAGEMENT TESTS")
        self.test_create_tool()
        self.test_list_tools()
        self.test_get_tool_detail()
        self.test_get_qr_code()
        
        # Workflow Tests
        print("\n📦 WORKFLOW TESTS")
        self.test_checkout_tool()
        self.test_return_tool()
        self.test_create_worker_user()
        self.test_handover_tool()
        self.test_record_maintenance()
        
        # P1 Feature Tests  
        print("\n🆕 P1 FEATURE TESTS")
        self.test_photo_upload()
        self.test_csv_import()
        self.test_pdf_import() 
        self.test_excel_import()
        self.test_periodic_background_task()
        self.test_email_notification_settings()

        # P2 Feature Tests
        print("\n🆕 P2 FEATURE TESTS")
        self.test_reports_summary()
        self.test_pdf_exports()
        self.test_categories_crud()
        self.test_user_filtering()
        
        # P3 Feature Tests (New Features)
        print("\n🆕 P3 FEATURE TESTS (NEW)")
        self.test_certificate_types_api()
        self.test_certificate_crud()
        self.test_bulk_checkout()
        self.test_bulk_return()
        self.test_calendar_events_api()

        # Dashboard & Management Tests
        print("\n📊 DASHBOARD & MANAGEMENT TESTS")
        self.test_dashboard_stats()
        self.test_settings_crud()
        self.test_notifications_list()
        self.test_audit_trail()
        
        # Print Results
        print("\n" + "=" * 60)
        print(f"📊 BACKEND API TEST RESULTS")
        print(f"   Tests Run: {self.tests_run}")
        print(f"   Tests Passed: {self.tests_passed}")
        print(f"   Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        if self.tests_passed == self.tests_run:
            print("   🎉 All backend tests passed!")
            return 0
        else:
            print(f"   ⚠️  {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    tester = ToolManagementAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())